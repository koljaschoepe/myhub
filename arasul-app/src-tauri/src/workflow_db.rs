//! SQLite persistence for workflow runs (Phase 3 v1.2 of vision-v3).
//!
//! Database location: `<drive_root>/memory/runs/runs.db`
//! Journal mode: WAL (durable + concurrent reads while a run writes).
//! Schema is forward-compatible via `CREATE TABLE IF NOT EXISTS` — no
//! migration framework yet; v1.3 introduces `schema_version` if needed.
//!
//! Storage strategy:
//!   - One row per run in `runs` (full status, started/finished, JSON-blobbed
//!     log + outputs).
//!   - One row per step in `step_progress`, keyed by (run_id, step_id) so
//!     loop-iteration step IDs (e.g. `loop_id[2].body_id`) are stable.
//!   - We DON'T store inputs / step types — those come from the workflow
//!     YAML on disk. A run row + step rows is enough to replay the UI view.
//!
//! Crash safety:
//!   - `runs.status = 'running'` after a crash gets cleaned up on next
//!     `WorkflowDb::open()` call (transitioned to 'aborted').
//!   - WAL ensures partial writes don't corrupt — last-checkpointed state
//!     is recoverable.

use std::path::Path;
use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::ipc::error::{ArasulError, Result};

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS runs (
  run_id        TEXT PRIMARY KEY,
  workflow_path TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  status        TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  error         TEXT,
  log           TEXT NOT NULL DEFAULT '[]',
  outputs       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_runs_workflow_started
  ON runs(workflow_path, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_started
  ON runs(started_at DESC);

CREATE TABLE IF NOT EXISTS step_progress (
  run_id    TEXT NOT NULL,
  step_id   TEXT NOT NULL,
  ord       INTEGER NOT NULL,
  status    TEXT NOT NULL,
  error     TEXT,
  PRIMARY KEY(run_id, step_id),
  FOREIGN KEY(run_id) REFERENCES runs(run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_step_progress_ord
  ON step_progress(run_id, ord);
"#;

/// Wraps a single SQLite connection behind a Mutex. SQLite is happy with one
/// connection serving all reads + writes when the schema isn't extreme;
/// for v1's run-history-scale we stay well under 100K rows.
pub struct WorkflowDb {
    conn: Mutex<Connection>,
}

impl WorkflowDb {
    /// Open or create the runs DB under `<drive_root>/memory/runs/`. On open,
    /// stale 'running' entries from a prior crashed session are transitioned
    /// to 'aborted' — no zombie runs in the history view.
    pub fn open(drive_root: &Path) -> Result<Arc<Self>> {
        let dir = drive_root.join("memory").join("runs");
        std::fs::create_dir_all(&dir).map_err(|e| ArasulError::Internal {
            message: format!("workflow_db mkdir {}: {e}", dir.display()),
        })?;
        let path = dir.join("runs.db");
        let conn = Connection::open(&path).map_err(|e| ArasulError::Internal {
            message: format!("workflow_db open {}: {e}", path.display()),
        })?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| ArasulError::Internal { message: format!("WAL pragma: {e}") })?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| ArasulError::Internal { message: format!("FK pragma: {e}") })?;
        conn.execute_batch(SCHEMA).map_err(|e| ArasulError::Internal {
            message: format!("workflow_db schema: {e}"),
        })?;
        // Crash recovery: any 'running' rows from a prior session are dead.
        conn.execute(
            "UPDATE runs SET status = 'aborted', finished_at = strftime('%s','now') \
             WHERE status = 'running'",
            [],
        ).map_err(|e| ArasulError::Internal { message: format!("crash-recovery: {e}") })?;
        Ok(Arc::new(Self { conn: Mutex::new(conn) }))
    }

    /// Initial INSERT when a run starts. The runner immediately follows up
    /// with `insert_step_progress` for the top-level steps.
    pub fn insert_run(
        &self,
        run_id: &str,
        workflow_path: &str,
        workflow_name: &str,
        started_at: u64,
    ) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO runs (run_id, workflow_path, workflow_name, status, started_at) \
             VALUES (?1, ?2, ?3, 'running', ?4)",
            params![run_id, workflow_path, workflow_name, started_at as i64],
        ).map_err(|e| ArasulError::Internal { message: format!("insert_run: {e}") })?;
        Ok(())
    }

    /// Insert/upsert a step_progress row. `ord` lets the UI render in
    /// authored order even when steps are appended dynamically (loop
    /// iterations, branch then/else).
    pub fn upsert_step(
        &self,
        run_id: &str,
        step_id: &str,
        ord: usize,
        status: &str,
        error: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO step_progress (run_id, step_id, ord, status, error) \
             VALUES (?1, ?2, ?3, ?4, ?5) \
             ON CONFLICT(run_id, step_id) DO UPDATE SET \
               status = excluded.status, error = excluded.error",
            params![run_id, step_id, ord as i64, status, error],
        ).map_err(|e| ArasulError::Internal { message: format!("upsert_step: {e}") })?;
        Ok(())
    }

    /// Persist log + outputs JSON. Cheap because the WAL absorbs the writes.
    /// Called on every step boundary in the runner.
    pub fn update_run_state(
        &self,
        run_id: &str,
        log_json: &str,
        outputs_json: &str,
    ) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE runs SET log = ?1, outputs = ?2 WHERE run_id = ?3",
            params![log_json, outputs_json, run_id],
        ).map_err(|e| ArasulError::Internal { message: format!("update_run_state: {e}") })?;
        Ok(())
    }

    /// Final transition to ok / failed / aborted plus finished_at timestamp.
    pub fn finalize_run(
        &self,
        run_id: &str,
        status: &str,
        finished_at: u64,
        error: Option<&str>,
        log_json: &str,
        outputs_json: &str,
    ) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE runs SET status = ?1, finished_at = ?2, error = ?3, \
                log = ?4, outputs = ?5 WHERE run_id = ?6",
            params![status, finished_at as i64, error, log_json, outputs_json, run_id],
        ).map_err(|e| ArasulError::Internal { message: format!("finalize_run: {e}") })?;
        Ok(())
    }

    /// History page for a workflow (or all workflows when `workflow_path` is None).
    pub fn list_runs(
        &self,
        workflow_path: Option<&str>,
        limit: usize,
    ) -> Result<Vec<RunSummary>> {
        let conn = self.conn.lock();
        let limit = limit.clamp(1, 500) as i64;
        let mut stmt = if let Some(path) = workflow_path {
            let mut s = conn.prepare(
                "SELECT run_id, workflow_path, workflow_name, status, started_at, finished_at, error \
                 FROM runs WHERE workflow_path = ?1 ORDER BY started_at DESC LIMIT ?2",
            ).map_err(|e| ArasulError::Internal { message: format!("list_runs prepare: {e}") })?;
            let rows = s
                .query_map(params![path, limit], row_to_summary)
                .and_then(|it| it.collect::<rusqlite::Result<Vec<_>>>())
                .map_err(|e| ArasulError::Internal { message: format!("list_runs query: {e}") })?;
            return Ok(rows);
        } else {
            conn.prepare(
                "SELECT run_id, workflow_path, workflow_name, status, started_at, finished_at, error \
                 FROM runs ORDER BY started_at DESC LIMIT ?1",
            ).map_err(|e| ArasulError::Internal { message: format!("list_runs prepare: {e}") })?
        };
        let rows = stmt
            .query_map(params![limit], row_to_summary)
            .and_then(|it| it.collect::<rusqlite::Result<Vec<_>>>())
            .map_err(|e| ArasulError::Internal { message: format!("list_runs query: {e}") })?;
        Ok(rows)
    }

    /// Full snapshot for replay UI. Returns None if the run has been deleted.
    pub fn load_full(&self, run_id: &str) -> Result<Option<RunRecord>> {
        let conn = self.conn.lock();
        let row: Option<RunRecord> = conn
            .query_row(
                "SELECT run_id, workflow_path, workflow_name, status, started_at, \
                        finished_at, error, log, outputs \
                 FROM runs WHERE run_id = ?1",
                params![run_id],
                |r| {
                    Ok(RunRecord {
                        run_id: r.get(0)?,
                        workflow_path: r.get(1)?,
                        workflow_name: r.get(2)?,
                        status: r.get(3)?,
                        started_at: r.get::<_, i64>(4)? as u64,
                        finished_at: r.get::<_, Option<i64>>(5)?.map(|v| v as u64),
                        error: r.get(6)?,
                        log_json: r.get(7)?,
                        outputs_json: r.get(8)?,
                        steps: Vec::new(),
                    })
                },
            )
            .optional()
            .map_err(|e| ArasulError::Internal { message: format!("load_full row: {e}") })?;

        let mut record = match row {
            Some(r) => r,
            None => return Ok(None),
        };

        let mut stmt = conn.prepare(
            "SELECT step_id, ord, status, error FROM step_progress \
             WHERE run_id = ?1 ORDER BY ord ASC",
        ).map_err(|e| ArasulError::Internal { message: format!("load_full steps prep: {e}") })?;
        let steps = stmt
            .query_map(params![run_id], |r| {
                Ok(StoredStepProgress {
                    step_id: r.get(0)?,
                    ord: r.get::<_, i64>(1)? as usize,
                    status: r.get(2)?,
                    error: r.get(3)?,
                })
            })
            .and_then(|it| it.collect::<rusqlite::Result<Vec<_>>>())
            .map_err(|e| ArasulError::Internal { message: format!("load_full steps: {e}") })?;
        record.steps = steps;
        Ok(Some(record))
    }

    pub fn delete_run(&self, run_id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM runs WHERE run_id = ?1", params![run_id])
            .map_err(|e| ArasulError::Internal { message: format!("delete_run: {e}") })?;
        Ok(())
    }
}

fn row_to_summary(r: &rusqlite::Row) -> rusqlite::Result<RunSummary> {
    Ok(RunSummary {
        run_id: r.get(0)?,
        workflow_path: r.get(1)?,
        workflow_name: r.get(2)?,
        status: r.get(3)?,
        started_at: r.get::<_, i64>(4)? as u64,
        finished_at: r.get::<_, Option<i64>>(5)?.map(|v| v as u64),
        error: r.get(6)?,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunSummary {
    pub run_id: String,
    pub workflow_path: String,
    pub workflow_name: String,
    pub status: String,
    pub started_at: u64,
    pub finished_at: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RunRecord {
    pub run_id: String,
    pub workflow_path: String,
    pub workflow_name: String,
    pub status: String,
    pub started_at: u64,
    pub finished_at: Option<u64>,
    pub error: Option<String>,
    pub log_json: String,
    pub outputs_json: String,
    pub steps: Vec<StoredStepProgress>,
}

#[derive(Debug, Clone)]
pub struct StoredStepProgress {
    pub step_id: String,
    pub ord: usize,
    pub status: String,
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn fresh_db() -> (tempfile::TempDir, Arc<WorkflowDb>) {
        let dir = tempdir().unwrap();
        // Simulate the drive root structure (.boot must exist for callers
        // that walk up looking for it; here we just need memory/runs/).
        std::fs::create_dir_all(dir.path().join(".boot")).unwrap();
        let db = WorkflowDb::open(dir.path()).unwrap();
        (dir, db)
    }

    #[test]
    fn schema_is_idempotent() {
        let (dir, db) = fresh_db();
        // Reopen — should not error.
        drop(db);
        let _db2 = WorkflowDb::open(dir.path()).unwrap();
    }

    #[test]
    fn round_trip_run_with_steps() {
        let (_dir, db) = fresh_db();
        db.insert_run("r1", "/p/wf.yaml", "Test", 1000).unwrap();
        db.upsert_step("r1", "a", 0, "running", None).unwrap();
        db.upsert_step("r1", "a", 0, "ok", None).unwrap();
        db.upsert_step("r1", "b", 1, "failed", Some("boom")).unwrap();
        db.update_run_state("r1", "[\"line1\",\"line2\"]", "{\"a\":42}").unwrap();
        db.finalize_run("r1", "failed", 1100, Some("a: boom"), "[\"line1\"]", "{\"a\":42}").unwrap();

        let history = db.list_runs(Some("/p/wf.yaml"), 10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].run_id, "r1");
        assert_eq!(history[0].status, "failed");
        assert_eq!(history[0].finished_at, Some(1100));
        assert_eq!(history[0].error.as_deref(), Some("a: boom"));

        let full = db.load_full("r1").unwrap().unwrap();
        assert_eq!(full.steps.len(), 2);
        assert_eq!(full.steps[0].step_id, "a");
        assert_eq!(full.steps[0].status, "ok");
        assert_eq!(full.steps[1].step_id, "b");
        assert_eq!(full.steps[1].status, "failed");
        assert_eq!(full.steps[1].error.as_deref(), Some("boom"));
        assert_eq!(full.outputs_json, "{\"a\":42}");
    }

    #[test]
    fn list_runs_filters_by_workflow_and_orders_desc() {
        let (_dir, db) = fresh_db();
        db.insert_run("r-old",   "/p/a.yaml", "A", 1000).unwrap();
        db.insert_run("r-mid",   "/p/b.yaml", "B", 2000).unwrap();
        db.insert_run("r-new",   "/p/a.yaml", "A", 3000).unwrap();
        let only_a = db.list_runs(Some("/p/a.yaml"), 50).unwrap();
        assert_eq!(only_a.len(), 2);
        assert_eq!(only_a[0].run_id, "r-new"); // newest first
        assert_eq!(only_a[1].run_id, "r-old");
        let all = db.list_runs(None, 50).unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].run_id, "r-new");
    }

    #[test]
    fn delete_cascades_to_steps() {
        let (_dir, db) = fresh_db();
        db.insert_run("r1", "/p/wf.yaml", "T", 1000).unwrap();
        db.upsert_step("r1", "a", 0, "ok", None).unwrap();
        db.upsert_step("r1", "b", 1, "ok", None).unwrap();
        db.delete_run("r1").unwrap();
        assert!(db.load_full("r1").unwrap().is_none());
        // Underlying steps gone via FK cascade.
        let conn = db.conn.lock();
        let cnt: i64 = conn
            .query_row("SELECT COUNT(*) FROM step_progress WHERE run_id = 'r1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(cnt, 0);
    }

    #[test]
    fn crash_recovery_aborts_stale_running_rows() {
        let (dir, db) = fresh_db();
        db.insert_run("r1", "/p/wf.yaml", "T", 1000).unwrap();
        // Don't finalize — simulate a crash.
        drop(db);
        let db2 = WorkflowDb::open(dir.path()).unwrap();
        let row = db2.load_full("r1").unwrap().unwrap();
        assert_eq!(row.status, "aborted");
        assert!(row.finished_at.is_some());
    }
}
