//! Workflow runner — Phase 3 of vision-v3.
//!
//! Architecture (v1, locked 2026-04-26):
//!   - YAML files in `content/projects/<slug>/workflows/` define Workflows
//!   - 6 step types: file.read, file.read.glob, file.write, claude,
//!     markdown.extract_tables, markdown.extract_codeblocks
//!   - Sequential execution via `std::thread::spawn` (no tokio yet — every
//!     step is short-running or shells out to a subprocess that already
//!     manages its own concurrency)
//!   - In-memory run state in WorkflowState; SQLite persistence in v1.1
//!   - Templating: `{{stepId.field}}` substitution before each step
//!   - Status reads via polling (`workflow_status`) + event emissions for
//!     log streaming (`workflow://<run_id>/log`, `<run_id>/done`)
//!
//! Out of scope for this slice:
//!   - branch / loop / prompt-user / shell / web.fetch step types (v1.1)
//!   - workbook.* steps — Phase 2 IPC exists but workflow integration v1.1
//!   - SQLite persistence + resume-after-crash
//!   - Visual node editor (YAML stays the source of truth)
//!   - Inputs / cron triggers / cost preview

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use calamine::{open_workbook_auto, Data, Reader};
use parking_lot::Mutex;
use rust_xlsxwriter::Workbook as XWorkbook;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::ipc::error::{ArasulError, Result};
use crate::workflow_db::{RunSummary, WorkflowDb};

// ---------------- Workflow definition (YAML schema) ----------------

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct WorkflowDef {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub steps: Vec<StepDef>,
    /// Phase 6.4 — emit a preflight warning when the static estimate of
    /// `claude` step invocations exceeds this number. Default
    /// `BUDGET_WARNING_DEFAULT` (10). Doesn't block execution; the goal is
    /// visibility, not friction. The Loop max_iterations cap is the hard
    /// guard against runaway quota burns.
    #[serde(default)]
    pub budget_warning_threshold: Option<usize>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum StepDef {
    #[serde(rename = "file.read")]
    FileRead {
        id: String,
        path: String,
    },

    #[serde(rename = "file.read.glob")]
    FileReadGlob {
        id: String,
        pattern: String,
    },

    #[serde(rename = "file.write")]
    FileWrite {
        id: String,
        path: String,
        content: String,
    },

    #[serde(rename = "claude")]
    Claude {
        id: String,
        prompt: String,
        #[serde(default)]
        system: Option<String>,
    },

    #[serde(rename = "markdown.extract_tables")]
    MdExtractTables {
        id: String,
        content: String,
    },

    #[serde(rename = "markdown.extract_codeblocks")]
    MdExtractCodeblocks {
        id: String,
        content: String,
        #[serde(default)]
        lang: Option<String>,
    },

    /// Conditional execution. The condition string is templated first,
    /// then evaluated: truthy if non-empty/non-"false"/non-"0", or via
    /// `LHS OP RHS` comparison (==, !=, <, <=, >, >=). Number-typed
    /// operands compare numerically; everything else string-wise.
    #[serde(rename = "branch")]
    Branch {
        id: String,
        condition: String,
        #[serde(default)]
        then: Vec<StepDef>,
        #[serde(default, rename = "else")]
        else_branch: Vec<StepDef>,
    },

    /// Iterate a referenced array. `over` is a step-output ref like
    /// `gather.files` (no curly braces — this is a structured ref, not a
    /// string template). On each iteration `as` and `<as>_index` are
    /// bound in the templating scope so body steps can reference them.
    ///
    /// `max_iterations` caps the loop to prevent runaway quota burns when an
    /// upstream step returns a much larger array than expected. If unset,
    /// the runner uses LOOP_DEFAULT_CAP (100). The hard ceiling enforced by
    /// the runner is LOOP_HARD_CAP (10_000) regardless of what's authored.
    #[serde(rename = "loop")]
    Loop {
        id: String,
        over: String,
        #[serde(rename = "as")]
        as_var: String,
        #[serde(default)]
        body: Vec<StepDef>,
        #[serde(default, rename = "max_iterations")]
        max_iterations: Option<usize>,
    },

    /// Execute a shell command. Sandboxed: the cwd must resolve under the
    /// workflow_dir or workflow's drive root — symlink escapes are rejected.
    #[serde(rename = "shell")]
    Shell {
        id: String,
        cmd: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        cwd: Option<String>,
    },

    /// Read a sheet of an .xlsx into structured rows. File-at-a-time —
    /// no handle pool. Output: { rows: [[strings]], headers: [strings], count }.
    #[serde(rename = "workbook.read")]
    WorkbookRead {
        id: String,
        path: String,
        #[serde(default)]
        sheet: Option<String>,
    },

    /// Build a fresh .xlsx from a markdown-table extraction. References a
    /// prior step's output (typically `markdown.extract_tables`) by id;
    /// `table_index` picks one if multiple tables were found.
    #[serde(rename = "workbook.from_markdown_table")]
    WorkbookFromMarkdownTable {
        id: String,
        from_step: String,
        #[serde(default)]
        table_index: usize,
        output: String,
        #[serde(default)]
        sheet_name: Option<String>,
    },

    /// Pause the workflow and surface an Interview question in the UI.
    /// `options` (if non-empty) renders as multi-choice buttons; otherwise
    /// the user gets a free-text input. The chosen / typed value lands as
    /// `outputs.<id>.answer`. Aborts cleanly if the user hits cancel or
    /// the run is aborted from the run controls.
    #[serde(rename = "prompt-user")]
    PromptUser {
        id: String,
        question: String,
        #[serde(default)]
        options: Vec<String>,
        #[serde(default)]
        allow_free_text: bool,
    },

    /// Make an HTTP request. Opt-in by inclusion — there's no allow-list
    /// guarding outbound traffic in v1, so workflow authors are explicitly
    /// signing off on the network call by adding this step. Output is
    /// `{ status, body, headers }`. `body` decodes UTF-8 when possible,
    /// otherwise base64.
    #[serde(rename = "web.fetch")]
    WebFetch {
        id: String,
        url: String,
        #[serde(default = "default_http_method")]
        method: String,
        #[serde(default)]
        headers: HashMap<String, String>,
        #[serde(default)]
        body: Option<String>,
        #[serde(default = "default_http_timeout")]
        timeout_ms: u64,
    },
}

fn default_http_method() -> String { "GET".into() }
fn default_http_timeout() -> u64 { 30_000 }

/// Phase 6.3 — runaway-loop guards. See StepDef::Loop docs.
pub const LOOP_DEFAULT_CAP: usize = 100;
pub const LOOP_HARD_CAP: usize = 10_000;

/// Phase 6.4 — preflight warning fires when static `claude` step count
/// exceeds this. Authors can override per-workflow via
/// `budget_warning_threshold` in the YAML.
pub const BUDGET_WARNING_DEFAULT: usize = 10;

/// Phase 6.2 — token-cost estimation. Static heuristic only; actual
/// usage will vary. Tuned to Claude Sonnet 4.5 list rates as of
/// 2026-Q2. If Anthropic re-prices, bump these and the changelog.
const CHARS_PER_TOKEN_HEURISTIC: f64 = 4.0;
const ASSUMED_OUTPUT_TOKENS_PER_CLAUDE_CALL: usize = 500;
const SONNET_INPUT_USD_PER_MTOK: f64 = 3.0;
const SONNET_OUTPUT_USD_PER_MTOK: f64 = 15.0;

/// Returns (claude_call_count, input_tokens_estimate) for the entire
/// workflow tree. Loops multiply their bodies by their effective cap
/// (`max_iterations` if set, else `LOOP_DEFAULT_CAP`). Branches are
/// counted optimistically — both arms summed — so the estimate is an
/// upper bound. Nested branches/loops compose multiplicatively.
fn preflight_walk(steps: &[StepDef]) -> (usize, usize) {
    let mut calls: usize = 0;
    let mut input_chars: usize = 0;
    for step in steps {
        match step {
            StepDef::Claude { prompt, system, .. } => {
                calls += 1;
                input_chars += prompt.chars().count();
                if let Some(s) = system {
                    input_chars += s.chars().count();
                }
            }
            StepDef::Loop { body, max_iterations, .. } => {
                let multiplier = max_iterations
                    .unwrap_or(LOOP_DEFAULT_CAP)
                    .min(LOOP_HARD_CAP);
                let (body_calls, body_chars) = preflight_walk(body);
                calls = calls.saturating_add(body_calls.saturating_mul(multiplier));
                input_chars =
                    input_chars.saturating_add(body_chars.saturating_mul(multiplier));
            }
            StepDef::Branch { then, else_branch, .. } => {
                let (t_calls, t_chars) = preflight_walk(then);
                let (e_calls, e_chars) = preflight_walk(else_branch);
                calls = calls.saturating_add(t_calls).saturating_add(e_calls);
                input_chars = input_chars.saturating_add(t_chars).saturating_add(e_chars);
            }
            _ => {}
        }
    }
    (calls, input_chars)
}

/// Render the four log lines the runner prepends on workflow start.
/// Pure function — easy to unit-test against fixture step trees.
fn preflight_log_lines(def: &WorkflowDef) -> Vec<String> {
    let (calls, input_chars) = preflight_walk(&def.steps);
    if calls == 0 {
        return vec!["📊 preflight: no claude steps — workflow is offline-only".to_string()];
    }
    let input_tokens = (input_chars as f64 / CHARS_PER_TOKEN_HEURISTIC).ceil() as usize;
    let output_tokens = calls.saturating_mul(ASSUMED_OUTPUT_TOKENS_PER_CLAUDE_CALL);
    let cost_usd = (input_tokens as f64 / 1_000_000.0) * SONNET_INPUT_USD_PER_MTOK
        + (output_tokens as f64 / 1_000_000.0) * SONNET_OUTPUT_USD_PER_MTOK;

    let threshold = def.budget_warning_threshold.unwrap_or(BUDGET_WARNING_DEFAULT);
    let mut lines = vec![format!(
        "📊 preflight: {calls} claude call(s), ~{input_tokens} input tokens, \
         ~{output_tokens} est. output tokens"
    )];
    lines.push(format!(
        "   est. cost ~${cost_usd:.4} (Sonnet 4.5 rates: ${SONNET_INPUT_USD_PER_MTOK}/M in, \
         ${SONNET_OUTPUT_USD_PER_MTOK}/M out — actual will vary)"
    ));
    if calls > threshold {
        lines.push(format!(
            "⚠ workflow has {calls} claude call(s), above the warning threshold of {threshold}. \
             Each call counts against your Claude subscription quota. Set \
             `budget_warning_threshold: <n>` in the workflow YAML to silence."
        ));
    }
    lines.push("   billed source: your active Claude subscription via the `claude` CLI subprocess (no API key, no Arasul proxy)".to_string());
    lines
}

impl StepDef {
    pub fn id(&self) -> &str {
        match self {
            StepDef::FileRead { id, .. } => id,
            StepDef::FileReadGlob { id, .. } => id,
            StepDef::FileWrite { id, .. } => id,
            StepDef::Claude { id, .. } => id,
            StepDef::MdExtractTables { id, .. } => id,
            StepDef::MdExtractCodeblocks { id, .. } => id,
            StepDef::Branch { id, .. } => id,
            StepDef::Loop { id, .. } => id,
            StepDef::Shell { id, .. } => id,
            StepDef::WorkbookRead { id, .. } => id,
            StepDef::WorkbookFromMarkdownTable { id, .. } => id,
            StepDef::PromptUser { id, .. } => id,
            StepDef::WebFetch { id, .. } => id,
        }
    }

    pub fn type_name(&self) -> &'static str {
        match self {
            StepDef::FileRead { .. } => "file.read",
            StepDef::FileReadGlob { .. } => "file.read.glob",
            StepDef::FileWrite { .. } => "file.write",
            StepDef::Claude { .. } => "claude",
            StepDef::MdExtractTables { .. } => "markdown.extract_tables",
            StepDef::MdExtractCodeblocks { .. } => "markdown.extract_codeblocks",
            StepDef::Branch { .. } => "branch",
            StepDef::Loop { .. } => "loop",
            StepDef::Shell { .. } => "shell",
            StepDef::WorkbookRead { .. } => "workbook.read",
            StepDef::WorkbookFromMarkdownTable { .. } => "workbook.from_markdown_table",
            StepDef::PromptUser { .. } => "prompt-user",
            StepDef::WebFetch { .. } => "web.fetch",
        }
    }
}

// ---------------- Run state (live runs in memory) ----------------

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Pending,
    Running,
    Ok,
    Failed,
    Aborted,
}

#[derive(Debug, Clone, Serialize)]
pub struct StepProgress {
    pub id: String,
    pub status: RunStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkflowRun {
    pub run_id: String,
    pub workflow_path: String,
    pub workflow_name: String,
    pub status: RunStatus,
    pub started_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_step: Option<String>,
    pub steps: Vec<StepProgress>,
    pub log: Vec<String>,
    /// Step output by step id. Stored as JSON so the templating layer can
    /// substitute structured fields (e.g. `{{gather.files}}`).
    pub outputs: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Cooperative abort flag — runner checks this at every step boundary.
    /// Cloned into the runner thread; setting it from `workflow_abort`
    /// causes the next step to fail-fast with status=Aborted.
    #[serde(skip)]
    abort_signal: Arc<AtomicBool>,
    /// Pending prompt-user request. Set by the runner when entering a
    /// PromptUser step; the runner thread blocks on `prompt_inbox` until
    /// `workflow_prompt_response` delivers the answer.
    #[serde(skip)]
    pending_prompt: Arc<Mutex<Option<PendingPrompt>>>,
    /// Inbox for prompt responses. The runner clones the receiver-side and
    /// blocks on it; `workflow_prompt_response` looks up the sender and
    /// sends the answer. One outstanding prompt per run at a time.
    #[serde(skip)]
    prompt_tx_slot: Arc<Mutex<Option<Sender<String>>>>,
}

/// Public snapshot of an outstanding prompt — surfaced via workflow_status
/// so a frontend that re-mounted mid-run still sees the open dialog.
#[derive(Debug, Clone, Serialize)]
pub struct PendingPrompt {
    pub step_id: String,
    pub question: String,
    pub options: Vec<String>,
    pub allow_free_text: bool,
}

#[derive(Default, Clone)]
pub struct WorkflowState {
    inner: Arc<Mutex<HashMap<String, WorkflowRun>>>,
    /// Lazy-initialized SQLite handle for run history. We don't know the
    /// drive_root at app start (auto-detect runs in the platform module),
    /// so the first workflow_run call seeds it.
    db: Arc<Mutex<Option<Arc<WorkflowDb>>>>,
}

impl WorkflowState {
    pub fn new() -> Self { Self::default() }

    /// Lazy DB accessor — opens `<drive_root>/memory/runs/runs.db` on first
    /// call. Subsequent calls reuse the cached handle. If DB init fails we
    /// log and return None so the runner stays operational without history.
    fn db_for(&self, drive_root: &Path) -> Option<Arc<WorkflowDb>> {
        let mut guard = self.db.lock();
        if let Some(db) = guard.as_ref() {
            return Some(Arc::clone(db));
        }
        match WorkflowDb::open(drive_root) {
            Ok(db) => {
                *guard = Some(Arc::clone(&db));
                Some(db)
            }
            Err(e) => {
                eprintln!("[workflow] DB init failed: {e:?} — running without persistence");
                None
            }
        }
    }
}

// ---------------- IPC: list, get, run, status ----------------

#[derive(Debug, Serialize)]
pub struct WorkflowMeta {
    pub path: String,
    pub name: String,
    pub description: Option<String>,
    pub step_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct ListArgs {
    pub project_path: String,
}

#[tauri::command]
pub fn workflow_list(args: ListArgs) -> Result<Vec<WorkflowMeta>> {
    let dir = PathBuf::from(&args.project_path).join("workflows");
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| ArasulError::Internal {
        message: format!("read_dir {}: {e}", dir.display()),
    })?;
    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if ext != "yaml" && ext != "yml" { continue; }
        match parse_workflow_file(&path) {
            Ok(def) => out.push(WorkflowMeta {
                path: path.to_string_lossy().to_string(),
                name: def.name,
                description: def.description,
                step_count: def.steps.len(),
            }),
            // Skip unparseable files but don't fail the whole list — bad
            // YAML in one workflow shouldn't hide the others.
            Err(_) => continue,
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct GetArgs {
    pub path: String,
}

#[tauri::command]
pub fn workflow_get(args: GetArgs) -> Result<WorkflowDef> {
    parse_workflow_file(Path::new(&args.path))
}

fn parse_workflow_file(path: &Path) -> Result<WorkflowDef> {
    let text = std::fs::read_to_string(path).map_err(|e| ArasulError::Internal {
        message: format!("read {}: {e}", path.display()),
    })?;
    serde_yaml::from_str(&text).map_err(|e| ArasulError::Internal {
        message: format!("workflow parse ({}): {e}", path.display()),
    })
}

#[derive(Debug, Deserialize)]
pub struct RunArgs {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct RunStartResult {
    pub run_id: String,
}

#[tauri::command]
pub fn workflow_run(
    app: AppHandle,
    state: tauri::State<'_, WorkflowState>,
    args: RunArgs,
) -> Result<RunStartResult> {
    let def = parse_workflow_file(Path::new(&args.path))?;
    let run_id = Uuid::new_v4().to_string();
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Pre-populate top-level steps so the UI can render the full plan
    // immediately. Nested branch/loop bodies get appended as they execute.
    let initial_steps: Vec<StepProgress> = def
        .steps
        .iter()
        .map(|s| StepProgress {
            id: s.id().to_string(),
            status: RunStatus::Pending,
            error: None,
        })
        .collect();

    let workflow_dir = PathBuf::from(&args.path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    let abort_signal = Arc::new(AtomicBool::new(false));

    // Phase 6.2 + 6.4 — static preflight: claude-call count + token/cost
    // estimate + budget-threshold warning. Pure-function output is folded
    // into the initial log so the UI shows it before step execution starts.
    let now = iso_clock();
    let mut initial_log: Vec<String> =
        vec![format!("[{}] starting workflow '{}'", now, def.name)];
    for line in preflight_log_lines(&def) {
        initial_log.push(format!("[{}] {}", now, line));
    }

    let run = WorkflowRun {
        run_id: run_id.clone(),
        workflow_path: args.path.clone(),
        workflow_name: def.name.clone(),
        status: RunStatus::Running,
        started_at,
        current_step: None,
        steps: initial_steps,
        log: initial_log,
        outputs: HashMap::new(),
        error: None,
        abort_signal: abort_signal.clone(),
        pending_prompt: Arc::new(Mutex::new(None)),
        prompt_tx_slot: Arc::new(Mutex::new(None)),
    };
    state.inner.lock().insert(run_id.clone(), run);

    // Persist the initial run + top-level pending steps to SQLite so the
    // history view picks it up immediately, and crash-recovery on next
    // startup transitions it to 'aborted' if we never finalize.
    let db = workflow_dir
        .ancestors()
        .find_map(|p| if p.join(".boot").exists() { Some(p.to_path_buf()) } else { None })
        .and_then(|root| state.db_for(&root));
    if let Some(db) = &db {
        let _ = db.insert_run(&run_id, &args.path, &def.name, started_at);
        for (i, step) in def.steps.iter().enumerate() {
            let _ = db.upsert_step(&run_id, step.id(), i, "pending", None);
        }
    }

    // Spawn the runner thread. We capture `app` for event emission and
    // `inner` for state mutations. The thread owns its own clone of def.
    let inner = state.inner.clone();
    let run_id_thread = run_id.clone();
    let db_thread = db.clone();
    thread::spawn(move || {
        run_workflow(app, inner, run_id_thread, def, workflow_dir, abort_signal, db_thread);
    });

    Ok(RunStartResult { run_id })
}

#[derive(Debug, Deserialize)]
pub struct AbortArgs {
    pub run_id: String,
}

/// Cooperative abort. Sets the abort flag — the runner sees it at the
/// next step boundary and stops, marking pending steps as Aborted.
#[tauri::command]
pub fn workflow_abort(
    state: tauri::State<'_, WorkflowState>,
    args: AbortArgs,
) -> Result<()> {
    let map = state.inner.lock();
    let run = map.get(&args.run_id).ok_or_else(|| ArasulError::Internal {
        message: format!("unknown run_id: {}", args.run_id),
    })?;
    run.abort_signal.store(true, Ordering::Relaxed);
    Ok(())
}

// ---------------- History IPC (P3.16-P3.18) ----------------

#[derive(Debug, Deserialize)]
pub struct HistoryArgs {
    pub drive_root: String,
    #[serde(default)]
    pub workflow_path: Option<String>,
    #[serde(default = "default_history_limit")]
    pub limit: usize,
}

fn default_history_limit() -> usize { 30 }

#[tauri::command]
pub fn workflow_run_history(
    state: tauri::State<'_, WorkflowState>,
    args: HistoryArgs,
) -> Result<Vec<RunSummary>> {
    let drive_root = PathBuf::from(&args.drive_root);
    let db = match state.db_for(&drive_root) {
        Some(db) => db,
        None => return Ok(vec![]),
    };
    db.list_runs(args.workflow_path.as_deref(), args.limit)
}

#[derive(Debug, Deserialize)]
pub struct LoadRunArgs {
    pub drive_root: String,
    pub run_id: String,
}

/// Reconstruct a WorkflowRun snapshot from persisted state. The shape
/// matches the live `workflow_status` response so the same frontend
/// renderer can show both replay and live runs.
// ---------------- Prompt-user IPC ----------------

#[derive(Debug, Deserialize)]
pub struct PromptResponseArgs {
    pub run_id: String,
    pub answer: String,
}

/// Deliver an answer to a pending prompt-user step. Looks up the run,
/// takes the response sender out of the slot, and sends the answer —
/// which unblocks the runner thread.
#[tauri::command]
pub fn workflow_prompt_response(
    state: tauri::State<'_, WorkflowState>,
    args: PromptResponseArgs,
) -> Result<()> {
    let map = state.inner.lock();
    let run = map.get(&args.run_id).ok_or_else(|| ArasulError::Internal {
        message: format!("unknown run_id: {}", args.run_id),
    })?;
    let tx = run.prompt_tx_slot.lock().take().ok_or_else(|| ArasulError::Internal {
        message: "no prompt is currently open for this run".into(),
    })?;
    // Clear the public pending_prompt mirror so workflow_status reflects
    // that we're no longer waiting on input.
    *run.pending_prompt.lock() = None;
    tx.send(args.answer).map_err(|_| ArasulError::Internal {
        message: "runner thread already gone — answer not delivered".into(),
    })?;
    Ok(())
}

#[tauri::command]
pub fn workflow_run_load(
    state: tauri::State<'_, WorkflowState>,
    args: LoadRunArgs,
) -> Result<WorkflowRun> {
    let drive_root = PathBuf::from(&args.drive_root);
    let db = state.db_for(&drive_root).ok_or_else(|| ArasulError::Internal {
        message: "history DB not available".into(),
    })?;
    let record = db.load_full(&args.run_id)?.ok_or_else(|| ArasulError::Internal {
        message: format!("run {} not in history", args.run_id),
    })?;

    let log: Vec<String> = serde_json::from_str(&record.log_json).unwrap_or_default();
    let outputs: HashMap<String, serde_json::Value> =
        serde_json::from_str(&record.outputs_json).unwrap_or_default();
    let status = match record.status.as_str() {
        "running"  => RunStatus::Running,
        "ok"       => RunStatus::Ok,
        "failed"   => RunStatus::Failed,
        "aborted"  => RunStatus::Aborted,
        _          => RunStatus::Pending,
    };
    let steps: Vec<StepProgress> = record.steps.iter().map(|s| StepProgress {
        id: s.step_id.clone(),
        status: match s.status.as_str() {
            "running" => RunStatus::Running,
            "ok"      => RunStatus::Ok,
            "failed"  => RunStatus::Failed,
            "aborted" => RunStatus::Aborted,
            _         => RunStatus::Pending,
        },
        error: s.error.clone(),
    }).collect();

    Ok(WorkflowRun {
        run_id: record.run_id,
        workflow_path: record.workflow_path,
        workflow_name: record.workflow_name,
        status,
        started_at: record.started_at,
        current_step: None,
        steps,
        log,
        outputs,
        error: record.error,
        // Replay views never run code; abort_signal is a placeholder to
        // satisfy the struct — setting it true is harmless since no thread
        // observes it.
        abort_signal: Arc::new(AtomicBool::new(true)),
        pending_prompt: Arc::new(Mutex::new(None)),
        prompt_tx_slot: Arc::new(Mutex::new(None)),
    })
}

#[derive(Debug, Deserialize)]
pub struct DeleteRunArgs {
    pub drive_root: String,
    pub run_id: String,
}

#[tauri::command]
pub fn workflow_run_delete(
    state: tauri::State<'_, WorkflowState>,
    args: DeleteRunArgs,
) -> Result<()> {
    let drive_root = PathBuf::from(&args.drive_root);
    let db = state.db_for(&drive_root).ok_or_else(|| ArasulError::Internal {
        message: "history DB not available".into(),
    })?;
    db.delete_run(&args.run_id)
}

#[derive(Debug, Deserialize)]
pub struct StatusArgs {
    pub run_id: String,
}

#[tauri::command]
pub fn workflow_status(
    state: tauri::State<'_, WorkflowState>,
    args: StatusArgs,
) -> Result<WorkflowRun> {
    state
        .inner
        .lock()
        .get(&args.run_id)
        .cloned()
        .ok_or_else(|| ArasulError::Internal {
            message: format!("unknown run_id: {}", args.run_id),
        })
}

// ---------------- Runner ----------------

#[allow(clippy::too_many_arguments)]
fn run_workflow(
    app: AppHandle,
    inner: Arc<Mutex<HashMap<String, WorkflowRun>>>,
    run_id: String,
    def: WorkflowDef,
    workflow_dir: PathBuf,
    abort: Arc<AtomicBool>,
    db: Option<Arc<WorkflowDb>>,
) {
    let mut outputs: HashMap<String, serde_json::Value> = HashMap::new();
    let final_status = match run_steps(
        &app, &inner, &run_id, &def.steps, &workflow_dir, &mut outputs, &abort, "", &db,
    ) {
        Ok(()) => RunStatus::Ok,
        Err(StepError::Aborted) => RunStatus::Aborted,
        Err(StepError::Failed) => RunStatus::Failed,
    };

    let (log_json, outputs_json, error_text) = {
        let mut map = inner.lock();
        if let Some(run) = map.get_mut(&run_id) {
            // Don't downgrade an already-set Failed/Aborted status.
            if run.status == RunStatus::Running {
                run.status = final_status;
            }
            run.current_step = None;
            // Mark any still-pending step as Aborted (after an abort).
            if matches!(run.status, RunStatus::Aborted) {
                for s in run.steps.iter_mut() {
                    if matches!(s.status, RunStatus::Pending | RunStatus::Running) {
                        s.status = RunStatus::Aborted;
                    }
                }
            }
            let line = match run.status {
                RunStatus::Ok       => format!("✓ workflow '{}' complete", def.name),
                RunStatus::Failed   => format!("✗ workflow '{}' failed", def.name),
                RunStatus::Aborted  => format!("⊗ workflow '{}' aborted", def.name),
                _                   => format!("workflow '{}' ended ({:?})", def.name, run.status),
            };
            push_log(run, &app, &run_id, &line);
            (
                serde_json::to_string(&run.log).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&run.outputs).unwrap_or_else(|_| "{}".into()),
                run.error.clone(),
            )
        } else {
            ("[]".to_string(), "{}".to_string(), None)
        }
    };

    let status_str = match final_status {
        RunStatus::Ok      => "ok",
        RunStatus::Failed  => "failed",
        RunStatus::Aborted => "aborted",
        _                  => "unknown",
    };

    if let Some(db) = &db {
        let finished_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        // Persist final aborted-step states alongside the run finalization.
        if matches!(final_status, RunStatus::Aborted) {
            if let Some(run) = inner.lock().get(&run_id) {
                for (i, sp) in run.steps.iter().enumerate() {
                    let status_label = match sp.status {
                        RunStatus::Aborted => "aborted",
                        RunStatus::Ok => "ok",
                        RunStatus::Failed => "failed",
                        RunStatus::Running => "running",
                        RunStatus::Pending => "pending",
                    };
                    let _ = db.upsert_step(&run_id, &sp.id, i, status_label, sp.error.as_deref());
                }
            }
        }
        let _ = db.finalize_run(
            &run_id,
            status_str,
            finished_at,
            error_text.as_deref(),
            &log_json,
            &outputs_json,
        );
    }

    let _ = app.emit(&format!("workflow://{run_id}/done"), serde_json::json!({
        "status": status_str,
    }));
}

#[derive(Debug)]
enum StepError {
    Aborted,
    Failed,
}

/// Recursive step walker. `id_prefix` namespaces nested step progress
/// entries (e.g. `loop_id[2].body_id`) for the UI; outputs are still
/// keyed by the bare step id so templating refs stay simple.
#[allow(clippy::too_many_arguments)]
fn run_steps(
    app: &AppHandle,
    inner: &Arc<Mutex<HashMap<String, WorkflowRun>>>,
    run_id: &str,
    steps: &[StepDef],
    workflow_dir: &Path,
    outputs: &mut HashMap<String, serde_json::Value>,
    abort: &Arc<AtomicBool>,
    id_prefix: &str,
    db: &Option<Arc<WorkflowDb>>,
) -> std::result::Result<(), StepError> {
    for step in steps {
        if abort.load(Ordering::Relaxed) {
            return Err(StepError::Aborted);
        }

        let bare_id = step.id().to_string();
        let qualified_id = if id_prefix.is_empty() {
            bare_id.clone()
        } else {
            format!("{id_prefix}.{bare_id}")
        };

        // For nested steps, append a fresh StepProgress entry. Top-level
        // entries already exist (pre-populated at run-start).
        let ord = ensure_step_progress(inner, run_id, &qualified_id);
        mark_step_running(inner, app, run_id, &qualified_id, step.type_name());
        if let Some(db) = db {
            let _ = db.upsert_step(run_id, &qualified_id, ord, "running", None);
        }

        // Branch / Loop are control-flow — they recurse into their bodies.
        // Other steps are leaves: resolve templating + execute + record.
        let outcome: std::result::Result<serde_json::Value, ArasulError> = match step {
            StepDef::Branch { condition, then, else_branch, .. } => {
                let cond_text = match substitute(condition, outputs) {
                    Ok(s) => s,
                    Err(e) => Err(e).map_err(|e| { record_failure(inner, app, run_id, &qualified_id, &e); StepError::Failed })?,
                };
                let truthy = eval_condition(&cond_text);
                let body = if truthy { then } else { else_branch };
                let nested_prefix = qualified_id.clone();
                let nested_result = run_steps(
                    app, inner, run_id, body, workflow_dir, outputs, abort, &nested_prefix, db,
                );
                match nested_result {
                    Ok(()) => Ok(serde_json::json!({ "taken": if truthy { "then" } else { "else" } })),
                    Err(StepError::Aborted) => return Err(StepError::Aborted),
                    Err(StepError::Failed) => {
                        // Mark the branch wrapper as Failed too.
                        record_failure_msg(inner, app, run_id, &qualified_id, "nested step failed");
                        return Err(StepError::Failed);
                    }
                }
            }

            StepDef::Loop { over, as_var, body, max_iterations, .. } => {
                let value = match lookup_value(over, outputs) {
                    Ok(v) => v,
                    Err(e) => { record_failure(inner, app, run_id, &qualified_id, &e); return Err(StepError::Failed); }
                };
                let arr = match value {
                    serde_json::Value::Array(a) => a,
                    other => {
                        let e = ArasulError::Internal {
                            message: format!("loop 'over' is not an array (got {})", short_type(&other)),
                        };
                        record_failure(inner, app, run_id, &qualified_id, &e);
                        return Err(StepError::Failed);
                    }
                };
                // Phase 6.3 — runaway-protection. Workflows that call `claude`
                // in a loop body bill against the user's subscription quota; an
                // unbounded loop on a surprise-large array can silently burn it.
                let authored = max_iterations.unwrap_or(LOOP_DEFAULT_CAP);
                let cap = authored.min(LOOP_HARD_CAP);
                if arr.len() > cap {
                    let e = ArasulError::Internal {
                        message: format!(
                            "loop refused: 'over' has {} elements but max_iterations cap is {} \
                             (default {}, hard ceiling {}). Set 'max_iterations' explicitly on \
                             the loop step if this is intentional.",
                            arr.len(), cap, LOOP_DEFAULT_CAP, LOOP_HARD_CAP
                        ),
                    };
                    record_failure(inner, app, run_id, &qualified_id, &e);
                    return Err(StepError::Failed);
                }
                let count = arr.len();
                for (i, item) in arr.into_iter().enumerate() {
                    if abort.load(Ordering::Relaxed) {
                        return Err(StepError::Aborted);
                    }
                    outputs.insert(as_var.clone(), item);
                    outputs.insert(format!("{as_var}_index"), serde_json::json!(i));
                    let iter_prefix = format!("{qualified_id}[{i}]");
                    if let Err(e) = run_steps(
                        app, inner, run_id, body, workflow_dir, outputs, abort, &iter_prefix, db,
                    ) {
                        outputs.remove(as_var);
                        outputs.remove(&format!("{as_var}_index"));
                        if matches!(e, StepError::Aborted) { return Err(StepError::Aborted); }
                        record_failure_msg(inner, app, run_id, &qualified_id, "loop body failed");
                        return Err(StepError::Failed);
                    }
                }
                outputs.remove(as_var);
                outputs.remove(&format!("{as_var}_index"));
                Ok(serde_json::json!({ "iterations": count }))
            }

            // PromptUser — block on a channel until the frontend delivers
            // an answer (or the run is aborted).
            StepDef::PromptUser { .. } => {
                let resolved = match resolve_step(step, outputs) {
                    Ok(r) => r,
                    Err(e) => { record_failure(inner, app, run_id, &qualified_id, &e); return Err(StepError::Failed); }
                };
                match wait_for_prompt(&resolved, app, inner, run_id, abort) {
                    Ok(answer) => Ok(serde_json::json!({ "answer": answer })),
                    Err(StepError::Aborted) => return Err(StepError::Aborted),
                    Err(StepError::Failed) => {
                        // Failure path already recorded inside wait_for_prompt.
                        return Err(StepError::Failed);
                    }
                }
            }
            // Other leaf steps — resolve templating then execute.
            _ => {
                let resolved = match resolve_step(step, outputs) {
                    Ok(r) => r,
                    Err(e) => { record_failure(inner, app, run_id, &qualified_id, &e); return Err(StepError::Failed); }
                };
                execute_step(&resolved, workflow_dir, outputs)
            }
        };

        match outcome {
            Ok(out) => {
                // Outputs keyed by bare id — branch/loop don't shadow leaves
                // outside their scope; nested loops just overwrite.
                outputs.insert(bare_id.clone(), out.clone());
                let (log_json, outputs_json) = {
                    let mut map = inner.lock();
                    if let Some(run) = map.get_mut(run_id) {
                        run.outputs.insert(bare_id.clone(), out);
                        if let Some(sp) = run.steps.iter_mut().find(|s| s.id == qualified_id) {
                            sp.status = RunStatus::Ok;
                        }
                        push_log(run, app, run_id, &format!("  ✓ {qualified_id} done"));
                        (
                            serde_json::to_string(&run.log).unwrap_or_else(|_| "[]".into()),
                            serde_json::to_string(&run.outputs).unwrap_or_else(|_| "{}".into()),
                        )
                    } else {
                        ("[]".into(), "{}".into())
                    }
                };
                if let Some(db) = db {
                    let _ = db.upsert_step(run_id, &qualified_id, ord, "ok", None);
                    let _ = db.update_run_state(run_id, &log_json, &outputs_json);
                }
            }
            Err(err) => {
                record_failure(inner, app, run_id, &qualified_id, &err);
                if let Some(db) = db {
                    let msg = match &err {
                        ArasulError::Internal { message } => message.clone(),
                        other => format!("{other:?}"),
                    };
                    let _ = db.upsert_step(run_id, &qualified_id, ord, "failed", Some(&msg));
                }
                return Err(StepError::Failed);
            }
        }
    }
    Ok(())
}

/// Ensure a StepProgress entry exists for this qualified id and return its
/// position in run.steps. Order is used by SQLite persistence to render the
/// UI in authored sequence even for dynamically-appended (loop/branch) steps.
fn ensure_step_progress(
    inner: &Arc<Mutex<HashMap<String, WorkflowRun>>>,
    run_id: &str,
    qualified_id: &str,
) -> usize {
    let mut map = inner.lock();
    if let Some(run) = map.get_mut(run_id) {
        if let Some(pos) = run.steps.iter().position(|s| s.id == qualified_id) {
            return pos;
        }
        let pos = run.steps.len();
        run.steps.push(StepProgress {
            id: qualified_id.to_string(),
            status: RunStatus::Pending,
            error: None,
        });
        return pos;
    }
    0
}

fn mark_step_running(
    inner: &Arc<Mutex<HashMap<String, WorkflowRun>>>,
    app: &AppHandle,
    run_id: &str,
    qualified_id: &str,
    type_name: &str,
) {
    let mut map = inner.lock();
    if let Some(run) = map.get_mut(run_id) {
        run.current_step = Some(qualified_id.to_string());
        if let Some(sp) = run.steps.iter_mut().find(|s| s.id == qualified_id) {
            sp.status = RunStatus::Running;
        }
        push_log(run, app, run_id, &format!("→ {qualified_id} ({type_name})"));
    }
}

/// Suspend the runner waiting for a PromptUser answer. Publishes the
/// pending prompt to the run state + emits an event for the UI; returns
/// when `workflow_prompt_response` delivers an answer, or with Aborted
/// when the user cancels the run.
fn wait_for_prompt(
    step: &StepDef,
    app: &AppHandle,
    inner: &Arc<Mutex<HashMap<String, WorkflowRun>>>,
    run_id: &str,
    abort: &Arc<AtomicBool>,
) -> std::result::Result<String, StepError> {
    let (step_id, question, options, allow_free_text) = match step {
        StepDef::PromptUser { id, question, options, allow_free_text } =>
            (id.clone(), question.clone(), options.clone(), *allow_free_text),
        _ => return Err(StepError::Failed),
    };

    let (tx, rx): (Sender<String>, Receiver<String>) = channel();

    {
        let map = inner.lock();
        let Some(run) = map.get(run_id) else { return Err(StepError::Failed); };
        *run.pending_prompt.lock() = Some(PendingPrompt {
            step_id: step_id.clone(),
            question: question.clone(),
            options: options.clone(),
            allow_free_text,
        });
        *run.prompt_tx_slot.lock() = Some(tx);
    }

    let _ = app.emit(
        &format!("workflow://{run_id}/prompt"),
        serde_json::json!({
            "step_id": step_id,
            "question": question,
            "options": options,
            "allow_free_text": allow_free_text,
        }),
    );

    // Block in 250ms slices so we notice abort flips. Frontend has all the
    // time it needs to show the modal and capture the user's answer.
    loop {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(answer) => return Ok(answer),
            Err(RecvTimeoutError::Timeout) => {
                if abort.load(Ordering::Relaxed) {
                    // Drop our slots so a stale answer doesn't get picked
                    // up by a subsequent prompt step.
                    let map = inner.lock();
                    if let Some(run) = map.get(run_id) {
                        *run.pending_prompt.lock() = None;
                        let _ = run.prompt_tx_slot.lock().take();
                    }
                    return Err(StepError::Aborted);
                }
            }
            Err(RecvTimeoutError::Disconnected) => {
                // Sender dropped — the run state was cleared from under us.
                return Err(StepError::Failed);
            }
        }
    }
}

fn record_failure(
    inner: &Arc<Mutex<HashMap<String, WorkflowRun>>>,
    app: &AppHandle,
    run_id: &str,
    qualified_id: &str,
    err: &ArasulError,
) {
    let msg = match err {
        ArasulError::Internal { message } => message.clone(),
        other => format!("{other:?}"),
    };
    record_failure_msg(inner, app, run_id, qualified_id, &msg);
}

fn record_failure_msg(
    inner: &Arc<Mutex<HashMap<String, WorkflowRun>>>,
    app: &AppHandle,
    run_id: &str,
    qualified_id: &str,
    msg: &str,
) {
    let mut map = inner.lock();
    if let Some(run) = map.get_mut(run_id) {
        if let Some(sp) = run.steps.iter_mut().find(|s| s.id == qualified_id) {
            sp.status = RunStatus::Failed;
            sp.error = Some(msg.to_string());
        }
        run.status = RunStatus::Failed;
        run.error = Some(format!("{qualified_id}: {msg}"));
        push_log(run, app, run_id, &format!("  ✗ {qualified_id} failed: {msg}"));
    }
}

/// Truthy + simple-comparison condition evaluator. Truthy: non-empty AND
/// not in {"false","no","0","null"}. Comparison: parses LHS OP RHS where
/// OP ∈ {==, !=, <, <=, >, >=}; numeric operands compare numerically.
fn eval_condition(s: &str) -> bool {
    let trimmed = s.trim();
    // Try comparison first (longest-match operators).
    let ops: [(&str, &str); 6] = [
        ("==", "=="), ("!=", "!="), ("<=", "<="), (">=", ">="), ("<", "<"), (">", ">"),
    ];
    for (token, _) in &ops {
        if let Some(idx) = trimmed.find(token) {
            // Avoid false-matching e.g. "==" inside "===" — but our token list
            // is the full Excel-ish set so this is fine.
            let lhs = trimmed[..idx].trim();
            let rhs = trimmed[idx + token.len()..].trim();
            return compare_op(lhs, rhs, token);
        }
    }
    if trimmed.is_empty() { return false; }
    let lower = trimmed.to_lowercase();
    !matches!(lower.as_str(), "false" | "no" | "0" | "null")
}

fn compare_op(lhs: &str, rhs: &str, op: &str) -> bool {
    // Strip surrounding quotes if any (string literals).
    let unquote = |s: &str| -> String {
        let t = s.trim();
        if (t.starts_with('"') && t.ends_with('"') && t.len() >= 2)
            || (t.starts_with('\'') && t.ends_with('\'') && t.len() >= 2)
        {
            t[1..t.len() - 1].to_string()
        } else {
            t.to_string()
        }
    };
    let l = unquote(lhs);
    let r = unquote(rhs);
    let cmp_num = match (l.parse::<f64>(), r.parse::<f64>()) {
        (Ok(a), Ok(b)) => Some(a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)),
        _ => None,
    };
    let cmp = cmp_num.unwrap_or_else(|| l.cmp(&r));
    use std::cmp::Ordering::*;
    match op {
        "==" => cmp == Equal,
        "!=" => cmp != Equal,
        "<"  => cmp == Less,
        "<=" => cmp != Greater,
        ">"  => cmp == Greater,
        ">=" => cmp != Less,
        _    => false,
    }
}

/// Look up a structured ref like "step.field.0" in the outputs map. Used
/// by Loop's `over` and Workbook*'s `from_step` — these accept a bare ref
/// (no curly-braces) and want the raw JSON value, not its stringification.
fn lookup_value(
    path: &str,
    outputs: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    let mut parts = path.split('.');
    let head = parts.next().ok_or_else(|| ArasulError::Internal {
        message: "empty ref".into(),
    })?;
    let mut value = outputs.get(head).cloned().ok_or_else(|| ArasulError::Internal {
        message: format!("ref: no step output for '{head}'"),
    })?;
    for seg in parts {
        // Numeric index for array fields.
        if let Ok(idx) = seg.parse::<usize>() {
            value = match value {
                serde_json::Value::Array(arr) => arr.get(idx).cloned().ok_or_else(|| ArasulError::Internal {
                    message: format!("ref '{path}': index {idx} out of bounds"),
                })?,
                other => return Err(ArasulError::Internal {
                    message: format!("ref '{path}': cannot index {} with {idx}", short_type(&other)),
                }),
            };
        } else if let Some(next) = value.get(seg) {
            value = next.clone();
        } else {
            return Err(ArasulError::Internal {
                message: format!("ref '{path}': missing field '{seg}'"),
            });
        }
    }
    Ok(value)
}

fn short_type(v: &serde_json::Value) -> &'static str {
    match v {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "bool",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    }
}

fn push_log(run: &mut WorkflowRun, app: &AppHandle, run_id: &str, line: &str) {
    let stamped = format!("[{}] {}", iso_clock(), line);
    run.log.push(stamped.clone());
    let _ = app.emit(&format!("workflow://{run_id}/log"), serde_json::json!({
        "line": stamped,
    }));
}

// ---------------- Templating ----------------

/// Walk every string field of a step and substitute `{{ref}}` placeholders
/// with values from prior step outputs. Numbers and bools stringify; arrays
/// of strings join with newlines (matches "list of files" / "list of lines"
/// semantics that workflow authors expect).
fn resolve_step(step: &StepDef, outputs: &HashMap<String, serde_json::Value>) -> Result<StepDef> {
    Ok(match step {
        StepDef::FileRead { id, path } => StepDef::FileRead {
            id: id.clone(),
            path: substitute(path, outputs)?,
        },
        StepDef::FileReadGlob { id, pattern } => StepDef::FileReadGlob {
            id: id.clone(),
            pattern: substitute(pattern, outputs)?,
        },
        StepDef::FileWrite { id, path, content } => StepDef::FileWrite {
            id: id.clone(),
            path: substitute(path, outputs)?,
            content: substitute(content, outputs)?,
        },
        StepDef::Claude { id, prompt, system } => StepDef::Claude {
            id: id.clone(),
            prompt: substitute(prompt, outputs)?,
            system: system.as_ref().map(|s| substitute(s, outputs)).transpose()?,
        },
        StepDef::MdExtractTables { id, content } => StepDef::MdExtractTables {
            id: id.clone(),
            content: substitute(content, outputs)?,
        },
        StepDef::MdExtractCodeblocks { id, content, lang } => StepDef::MdExtractCodeblocks {
            id: id.clone(),
            content: substitute(content, outputs)?,
            lang: lang.clone(),
        },
        StepDef::Shell { id, cmd, args, cwd } => StepDef::Shell {
            id: id.clone(),
            cmd: substitute(cmd, outputs)?,
            args: args.iter().map(|a| substitute(a, outputs)).collect::<Result<Vec<_>>>()?,
            cwd: cwd.as_ref().map(|c| substitute(c, outputs)).transpose()?,
        },
        StepDef::WorkbookRead { id, path, sheet } => StepDef::WorkbookRead {
            id: id.clone(),
            path: substitute(path, outputs)?,
            sheet: sheet.as_ref().map(|s| substitute(s, outputs)).transpose()?,
        },
        StepDef::WorkbookFromMarkdownTable { id, from_step, table_index, output, sheet_name } => {
            StepDef::WorkbookFromMarkdownTable {
                id: id.clone(),
                from_step: from_step.clone(),
                table_index: *table_index,
                output: substitute(output, outputs)?,
                sheet_name: sheet_name.clone(),
            }
        }
        StepDef::PromptUser { id, question, options, allow_free_text } => StepDef::PromptUser {
            id: id.clone(),
            question: substitute(question, outputs)?,
            options: options.iter().map(|o| substitute(o, outputs)).collect::<Result<Vec<_>>>()?,
            allow_free_text: *allow_free_text,
        },
        StepDef::WebFetch { id, url, method, headers, body, timeout_ms } => StepDef::WebFetch {
            id: id.clone(),
            url: substitute(url, outputs)?,
            method: method.clone(),
            headers: {
                let mut out = HashMap::new();
                for (k, v) in headers {
                    out.insert(k.clone(), substitute(v, outputs)?);
                }
                out
            },
            body: body.as_ref().map(|b| substitute(b, outputs)).transpose()?,
            timeout_ms: *timeout_ms,
        },
        // Branch / Loop are not resolved here — the runner handles them
        // directly because their child steps need fresh templating context
        // each iteration.
        StepDef::Branch { .. } | StepDef::Loop { .. } => step.clone(),
    })
}

/// Replace every `{{path.subpath...}}` in `s` with its JSON-pointer-resolved
/// stringification from `outputs`. Unknown refs become an error.
fn substitute(s: &str, outputs: &HashMap<String, serde_json::Value>) -> Result<String> {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            // Find closing }}.
            let rest = &s[i + 2..];
            if let Some(end_rel) = rest.find("}}") {
                let inner = rest[..end_rel].trim();
                let value = lookup_ref(inner, outputs)?;
                out.push_str(&value);
                i += 2 + end_rel + 2;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    Ok(out)
}

fn lookup_ref(path: &str, outputs: &HashMap<String, serde_json::Value>) -> Result<String> {
    let mut parts = path.split('.');
    let head = parts.next().ok_or_else(|| ArasulError::Internal {
        message: "empty templating ref".into(),
    })?;
    let mut value = outputs
        .get(head)
        .cloned()
        .ok_or_else(|| ArasulError::Internal {
            message: format!("templating: no step output for '{head}'"),
        })?;
    for seg in parts {
        // Support .text shorthand for objects with a primary "text" field.
        if let Some(next) = value.get(seg) {
            value = next.clone();
        } else {
            return Err(ArasulError::Internal {
                message: format!("templating: '{path}' missing field '{seg}'"),
            });
        }
    }
    Ok(value_to_string(&value))
}

fn value_to_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => String::new(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => arr
            .iter()
            .map(value_to_string)
            .collect::<Vec<_>>()
            .join("\n"),
        serde_json::Value::Object(_) => v.to_string(),
    }
}

// ---------------- Step execution ----------------

fn execute_step(
    step: &StepDef,
    workflow_dir: &Path,
    outputs: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    match step {
        StepDef::FileRead { path, .. } => {
            let p = resolve_path(workflow_dir, path);
            let text = std::fs::read_to_string(&p).map_err(|e| ArasulError::Internal {
                message: format!("file.read {}: {e}", p.display()),
            })?;
            Ok(serde_json::json!({
                "path": p.to_string_lossy(),
                "text": text,
            }))
        }
        StepDef::FileReadGlob { pattern, .. } => {
            // Resolve relative globs against workflow_dir, but absolute
            // patterns stay verbatim.
            let pat_path = resolve_path(workflow_dir, pattern);
            let pat_str = pat_path.to_string_lossy().to_string();
            let mut files: Vec<String> = Vec::new();
            let mut texts: Vec<String> = Vec::new();
            for entry in glob::glob(&pat_str).map_err(|e| ArasulError::Internal {
                message: format!("file.read.glob bad pattern '{pat_str}': {e}"),
            })? {
                let p = entry.map_err(|e| ArasulError::Internal {
                    message: format!("file.read.glob: {e}"),
                })?;
                if !p.is_file() { continue; }
                let text = std::fs::read_to_string(&p).map_err(|e| ArasulError::Internal {
                    message: format!("file.read.glob read {}: {e}", p.display()),
                })?;
                files.push(p.to_string_lossy().to_string());
                texts.push(text);
            }
            let count = files.len();
            let joined = texts.join("\n\n---\n\n");
            Ok(serde_json::json!({
                "files": files,
                "count": count,
                "text": joined,
            }))
        }
        StepDef::FileWrite { path, content, .. } => {
            let p = resolve_path(workflow_dir, path);
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent).map_err(|e| ArasulError::Internal {
                    message: format!("file.write mkdir {}: {e}", parent.display()),
                })?;
            }
            std::fs::write(&p, content).map_err(|e| ArasulError::Internal {
                message: format!("file.write {}: {e}", p.display()),
            })?;
            Ok(serde_json::json!({
                "path": p.to_string_lossy(),
                "bytes": content.len(),
            }))
        }
        StepDef::Claude { prompt, system, .. } => {
            let claude = which("claude").ok_or_else(|| ArasulError::Internal {
                message: "Claude CLI not found on PATH. Install Claude Code or place a binary at \
                          bin/claude-<os>-<arch> on the SSD."
                    .into(),
            })?;
            let combined = match system {
                Some(sys) if !sys.trim().is_empty() => format!(
                    "{}\n\n===input===\n{}\n===end===\n\nReply with ONLY the transformed result. No preamble.",
                    sys.trim(),
                    prompt.trim(),
                ),
                _ => prompt.clone(),
            };
            let output = Command::new(&claude)
                .args(["-p", &combined])
                .output()
                .map_err(|e| ArasulError::Internal {
                    message: format!("claude exec: {e}"),
                })?;
            if !output.status.success() {
                return Err(ArasulError::Internal {
                    message: format!(
                        "claude exited {} — {}",
                        output.status.code().unwrap_or(-1),
                        String::from_utf8_lossy(&output.stderr).trim()
                    ),
                });
            }
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(serde_json::json!({
                "text": text,
            }))
        }
        StepDef::MdExtractTables { content, .. } => {
            let tables = extract_markdown_tables(content);
            Ok(serde_json::json!({
                "count": tables.len(),
                "tables": tables,
            }))
        }
        StepDef::MdExtractCodeblocks { content, lang, .. } => {
            let blocks = extract_codeblocks(content, lang.as_deref());
            Ok(serde_json::json!({
                "count": blocks.len(),
                "blocks": blocks,
            }))
        }
        StepDef::Shell { cmd, args, cwd, .. } => {
            // Sandbox: cwd (if any) must canonicalize under the workflow_dir.
            let resolved_cwd = match cwd {
                Some(c) => {
                    let p = resolve_path(workflow_dir, c);
                    let canon = p.canonicalize().map_err(|e| ArasulError::Internal {
                        message: format!("shell cwd '{}': {e}", p.display()),
                    })?;
                    let workflow_canon = workflow_dir
                        .canonicalize()
                        .unwrap_or_else(|_| workflow_dir.to_path_buf());
                    // Walk up to find a "drive root" (parent containing .boot).
                    // Allow cwd anywhere under it. This matches the SSD-sandbox
                    // contract used elsewhere in the app.
                    let allowed_root = find_drive_root(&workflow_canon).unwrap_or(workflow_canon);
                    if !canon.starts_with(&allowed_root) {
                        return Err(ArasulError::Internal {
                            message: format!(
                                "shell cwd escapes workspace: {} (allowed under {})",
                                canon.display(), allowed_root.display(),
                            ),
                        });
                    }
                    canon
                }
                None => workflow_dir.to_path_buf(),
            };
            let mut command = Command::new(cmd);
            command.args(args);
            command.current_dir(&resolved_cwd);
            let output = command.output().map_err(|e| ArasulError::Internal {
                message: format!("shell exec '{cmd}': {e}"),
            })?;
            let exit_code = output.status.code().unwrap_or(-1);
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if !output.status.success() {
                return Err(ArasulError::Internal {
                    message: format!(
                        "shell '{cmd}' exited {exit_code}: {}",
                        stderr.trim(),
                    ),
                });
            }
            Ok(serde_json::json!({
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": exit_code,
            }))
        }
        StepDef::WorkbookRead { path, sheet, .. } => {
            let p = resolve_path(workflow_dir, path);
            let mut wb = open_workbook_auto(&p).map_err(|e| ArasulError::Internal {
                message: format!("workbook.read open {}: {e}", p.display()),
            })?;
            let sheet_name = match sheet {
                Some(s) => s.clone(),
                None => wb.sheet_names().first().cloned().ok_or_else(|| ArasulError::Internal {
                    message: format!("workbook.read {}: no sheets", p.display()),
                })?,
            };
            let range = wb.worksheet_range(&sheet_name).map_err(|e| ArasulError::Internal {
                message: format!("workbook.read sheet '{sheet_name}': {e}"),
            })?;
            let rows: Vec<Vec<String>> = range
                .rows()
                .map(|row| row.iter().map(cell_to_string).collect())
                .collect();
            // Convention: first row as headers when present.
            let headers: Vec<String> = rows.first().cloned().unwrap_or_default();
            let body: Vec<Vec<String>> = rows.iter().skip(1).cloned().collect();
            Ok(serde_json::json!({
                "path": p.to_string_lossy(),
                "sheet": sheet_name,
                "headers": headers,
                "rows": body,
                "all_rows": rows,
                "count": body.len(),
            }))
        }
        StepDef::WorkbookFromMarkdownTable {
            from_step, table_index, output, sheet_name, ..
        } => {
            let from_value = outputs.get(from_step).ok_or_else(|| ArasulError::Internal {
                message: format!("workbook.from_markdown_table: no output for step '{from_step}'"),
            })?;
            let tables = from_value.get("tables").ok_or_else(|| ArasulError::Internal {
                message: format!("workbook.from_markdown_table: '{from_step}' has no .tables"),
            })?;
            let table = tables.get(*table_index).ok_or_else(|| ArasulError::Internal {
                message: format!(
                    "workbook.from_markdown_table: table_index {} out of range",
                    table_index,
                ),
            })?;
            let headers: Vec<String> = table
                .get("headers")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().map(|x| x.as_str().unwrap_or("").to_string()).collect())
                .unwrap_or_default();
            let rows: Vec<Vec<String>> = table
                .get("rows")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .map(|r| {
                            r.as_array()
                                .map(|cells| cells.iter().map(|c| c.as_str().unwrap_or("").to_string()).collect())
                                .unwrap_or_default()
                        })
                        .collect()
                })
                .unwrap_or_default();

            let out_path = resolve_path(workflow_dir, output);
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| ArasulError::Internal {
                    message: format!("workbook.from_markdown_table mkdir {}: {e}", parent.display()),
                })?;
            }
            let mut wb = XWorkbook::new();
            let sheet_label = sheet_name.clone().unwrap_or_else(|| "Sheet1".to_string());
            let ws = wb
                .add_worksheet()
                .set_name(&sheet_label)
                .map_err(|e| ArasulError::Internal {
                    message: format!("workbook.from_markdown_table sheet name: {e}"),
                })?;
            // Headers in row 0.
            for (c, h) in headers.iter().enumerate() {
                ws.write_string(0, c as u16, h).map_err(|e| ArasulError::Internal {
                    message: format!("workbook.from_markdown_table header: {e}"),
                })?;
            }
            // Body rows. Try to coerce numeric-looking cells to Number cells
            // so downstream Excel formulas can sum them.
            for (r, row) in rows.iter().enumerate() {
                for (c, cell) in row.iter().enumerate() {
                    let row_idx = (r + 1) as u32;
                    let col_idx = c as u16;
                    if let Ok(num) = cell.parse::<f64>() {
                        ws.write_number(row_idx, col_idx, num).map_err(|e| ArasulError::Internal {
                            message: format!("workbook.from_markdown_table number: {e}"),
                        })?;
                    } else {
                        ws.write_string(row_idx, col_idx, cell).map_err(|e| ArasulError::Internal {
                            message: format!("workbook.from_markdown_table string: {e}"),
                        })?;
                    }
                }
            }
            wb.save(&out_path).map_err(|e| ArasulError::Internal {
                message: format!("workbook.from_markdown_table save {}: {e}", out_path.display()),
            })?;
            Ok(serde_json::json!({
                "path": out_path.to_string_lossy(),
                "sheet": sheet_label,
                "rows": rows.len(),
                "cols": headers.len().max(rows.iter().map(|r| r.len()).max().unwrap_or(0)),
            }))
        }
        StepDef::WebFetch { url, method, headers, body, timeout_ms, .. } => {
            // ureq blocks the calling thread — fine here, the runner is
            // already on its own thread.
            let agent = ureq::AgentBuilder::new()
                .timeout(Duration::from_millis(*timeout_ms))
                .build();
            let mut req = match method.to_uppercase().as_str() {
                "GET"    => agent.get(url),
                "POST"   => agent.post(url),
                "PUT"    => agent.put(url),
                "DELETE" => agent.delete(url),
                "PATCH"  => agent.request("PATCH", url),
                "HEAD"   => agent.head(url),
                other    => return Err(ArasulError::Internal {
                    message: format!("web.fetch unsupported method '{other}'"),
                }),
            };
            for (k, v) in headers {
                req = req.set(k, v);
            }
            let response = match body {
                Some(b) => req.send_string(b),
                None    => req.call(),
            };
            let response = match response {
                Ok(r) => r,
                // ureq surfaces non-2xx responses as Error::Status — capture
                // the body anyway so the workflow can branch on it.
                Err(ureq::Error::Status(code, r)) => {
                    let header_keys: Vec<String> = r.headers_names();
                    let mut header_map = serde_json::Map::new();
                    for k in &header_keys {
                        if let Some(v) = r.header(k) {
                            header_map.insert(k.clone(), serde_json::json!(v));
                        }
                    }
                    let body_text = r.into_string().unwrap_or_default();
                    return Ok(serde_json::json!({
                        "status": code,
                        "ok": false,
                        "body": body_text,
                        "headers": header_map,
                    }));
                }
                Err(e) => return Err(ArasulError::Internal {
                    message: format!("web.fetch failed: {e}"),
                }),
            };
            let status = response.status();
            let header_keys: Vec<String> = response.headers_names();
            let mut header_map = serde_json::Map::new();
            for k in &header_keys {
                if let Some(v) = response.header(k) {
                    header_map.insert(k.clone(), serde_json::json!(v));
                }
            }
            let body_text = response.into_string().map_err(|e| ArasulError::Internal {
                message: format!("web.fetch read body: {e}"),
            })?;
            Ok(serde_json::json!({
                "status": status,
                "ok": (200..300).contains(&status),
                "body": body_text,
                "headers": header_map,
            }))
        }
        // PromptUser is handled inline in the runner because it needs the
        // shared run state to publish the pending-prompt and block on the
        // response channel — execute_step doesn't have those.
        StepDef::PromptUser { .. } => {
            Err(ArasulError::Internal {
                message: "internal: prompt-user routed to execute_step (should be runner-handled)".into(),
            })
        }
        // Branch / Loop never reach execute_step — the runner handles them.
        StepDef::Branch { .. } | StepDef::Loop { .. } => {
            Err(ArasulError::Internal {
                message: "internal: control-flow step routed to execute_step".into(),
            })
        }
    }
}

fn cell_to_string(d: &Data) -> String {
    match d {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) => {
            if f.fract() == 0.0 && f.abs() < 1e16 {
                format!("{}", *f as i64)
            } else {
                format!("{f}")
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => (if *b { "TRUE" } else { "FALSE" }).into(),
        Data::DateTime(dt) => dt.to_string(),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("#{e:?}"),
    }
}

/// Walk up from `start` looking for a directory that contains `.boot` —
/// the conventional marker for the SSD root used elsewhere (platform.rs).
/// Falls back to None if no such ancestor exists.
fn find_drive_root(start: &Path) -> Option<PathBuf> {
    let mut cur: Option<&Path> = Some(start);
    while let Some(p) = cur {
        if p.join(".boot").exists() {
            return Some(p.to_path_buf());
        }
        cur = p.parent();
    }
    None
}

/// Resolve a path. Absolute paths pass through; relative paths are joined
/// with `base` (the directory of the workflow YAML).
fn resolve_path(base: &Path, p: &str) -> PathBuf {
    let pb = PathBuf::from(p);
    if pb.is_absolute() { pb } else { base.join(pb) }
}

/// Tiny markdown table extractor. Recognizes GitHub-style:
/// | h1 | h2 |\n|----|----|\n| a | b |\n
/// Returns each table as { headers: [...], rows: [[...], ...] }.
fn extract_markdown_tables(md: &str) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    let lines: Vec<&str> = md.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        if line.starts_with('|') && line.ends_with('|') && i + 1 < lines.len() {
            let sep = lines[i + 1].trim();
            // Separator row: at least one '---' between pipes.
            let is_sep = sep.starts_with('|')
                && sep.ends_with('|')
                && sep.contains("---");
            if is_sep {
                let headers = split_md_row(line);
                let mut rows = Vec::new();
                let mut j = i + 2;
                while j < lines.len() {
                    let r = lines[j].trim();
                    if r.starts_with('|') && r.ends_with('|') && !r.contains("---") {
                        rows.push(split_md_row(r));
                        j += 1;
                    } else {
                        break;
                    }
                }
                out.push(serde_json::json!({
                    "headers": headers,
                    "rows": rows,
                }));
                i = j;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn split_md_row(line: &str) -> Vec<String> {
    let inner = line.trim().trim_start_matches('|').trim_end_matches('|');
    inner
        .split('|')
        .map(|c| c.trim().to_string())
        .collect()
}

/// Extract fenced code blocks. If `lang_filter` is Some, only blocks with
/// matching info-string return.
fn extract_codeblocks(md: &str, lang_filter: Option<&str>) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    let lines: Vec<&str> = md.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if line.trim_start().starts_with("```") {
            let info = line.trim_start().trim_start_matches("```").trim().to_string();
            let mut body: Vec<&str> = Vec::new();
            let mut j = i + 1;
            while j < lines.len() && !lines[j].trim_start().starts_with("```") {
                body.push(lines[j]);
                j += 1;
            }
            let matches_filter = match lang_filter {
                None => true,
                Some(want) => info.eq_ignore_ascii_case(want),
            };
            if matches_filter {
                out.push(serde_json::json!({
                    "lang": info,
                    "code": body.join("\n"),
                }));
            }
            i = j + 1;
        } else {
            i += 1;
        }
    }
    out
}

// ---------------- Helpers ----------------

fn which(cmd: &str) -> Option<String> {
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        let p = dir.join(cmd);
        if p.is_file() { return Some(p.to_string_lossy().to_string()); }
        #[cfg(target_os = "windows")]
        {
            let p_exe = dir.join(format!("{cmd}.exe"));
            if p_exe.is_file() { return Some(p_exe.to_string_lossy().to_string()); }
        }
    }
    None
}

fn iso_clock() -> String {
    // Compact HH:MM:SS for log lines — full ISO is too verbose for a 60-line scroll.
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = now.as_secs();
    let h = (secs / 3600) % 24;
    let m = (secs / 60) % 60;
    let s = secs % 60;
    format!("{h:02}:{m:02}:{s:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_minimal_workflow_yaml() {
        let yaml = r#"
name: Test
steps:
  - id: read
    type: file.read
    path: /tmp/x.txt
  - id: ask
    type: claude
    prompt: "Summarize {{read.text}}"
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(def.name, "Test");
        assert_eq!(def.steps.len(), 2);
        assert!(matches!(def.steps[0], StepDef::FileRead { .. }));
        assert!(matches!(def.steps[1], StepDef::Claude { .. }));
    }

    #[test]
    fn templating_substitutes_simple_ref() {
        let mut outputs: HashMap<String, serde_json::Value> = HashMap::new();
        outputs.insert("read".into(), serde_json::json!({ "text": "hello world" }));
        let s = substitute("Greeting: {{read.text}}", &outputs).unwrap();
        assert_eq!(s, "Greeting: hello world");
    }

    #[test]
    fn templating_unknown_ref_errors() {
        let outputs: HashMap<String, serde_json::Value> = HashMap::new();
        let r = substitute("X: {{nope.field}}", &outputs);
        assert!(r.is_err());
    }

    #[test]
    fn extract_table_finds_one() {
        let md = "Some text.\n\n| Name | Age |\n|------|-----|\n| Ada | 42 |\n| Lin | 31 |\n\nMore text.";
        let tables = extract_markdown_tables(md);
        assert_eq!(tables.len(), 1);
        assert_eq!(tables[0]["headers"][0], "Name");
        assert_eq!(tables[0]["rows"][0][1], "42");
    }

    #[test]
    fn extract_codeblock_filters_by_lang() {
        let md = "```rust\nfn x() {}\n```\n\n```python\nprint('hi')\n```";
        let all = extract_codeblocks(md, None);
        assert_eq!(all.len(), 2);
        let only_rust = extract_codeblocks(md, Some("rust"));
        assert_eq!(only_rust.len(), 1);
        assert_eq!(only_rust[0]["lang"], "rust");
    }

    // ---------------- Control-flow tests (Phase 3 v1.1) ----------------

    #[test]
    fn condition_truthy_semantics() {
        assert!(eval_condition("yes"));
        assert!(eval_condition("hello"));
        assert!(eval_condition("1"));
        assert!(!eval_condition(""));
        assert!(!eval_condition("   "));
        assert!(!eval_condition("false"));
        assert!(!eval_condition("FALSE"));
        assert!(!eval_condition("no"));
        assert!(!eval_condition("0"));
        assert!(!eval_condition("null"));
    }

    #[test]
    fn condition_numeric_comparison() {
        assert!(eval_condition("5 > 3"));
        assert!(!eval_condition("5 < 3"));
        assert!(eval_condition("3 == 3"));
        assert!(eval_condition("3 != 4"));
        assert!(eval_condition("3 <= 3"));
        assert!(eval_condition("3 >= 3"));
        assert!(eval_condition("3.14 > 3"));
        assert!(!eval_condition("10 == 11"));
    }

    #[test]
    fn condition_string_comparison() {
        assert!(eval_condition("foo == foo"));
        assert!(eval_condition("foo != bar"));
        assert!(eval_condition("\"hello\" == hello"));
        assert!(!eval_condition("\"hello\" == world"));
    }

    #[test]
    fn lookup_value_walks_nested_json() {
        let mut outputs: HashMap<String, serde_json::Value> = HashMap::new();
        outputs.insert("step".into(), serde_json::json!({
            "tables": [
                { "headers": ["a", "b"], "rows": [["1", "2"]] },
                { "headers": ["x"], "rows": [] },
            ],
            "count": 2,
        }));
        let v = lookup_value("step.tables.0.headers.1", &outputs).unwrap();
        assert_eq!(v, serde_json::json!("b"));
        let v = lookup_value("step.count", &outputs).unwrap();
        assert_eq!(v, serde_json::json!(2));
        // Out-of-bounds index errors.
        assert!(lookup_value("step.tables.99", &outputs).is_err());
        // Missing key errors.
        assert!(lookup_value("step.nonexistent", &outputs).is_err());
    }

    #[test]
    fn parse_branch_loop_shell_yaml() {
        let yaml = r#"
name: Mixed
steps:
  - id: maybe
    type: branch
    condition: "1 == 1"
    then:
      - id: inside
        type: file.read
        path: /tmp/x.txt
    else: []
  - id: each
    type: loop
    over: maybe.taken
    as: item
    body:
      - id: shell_item
        type: shell
        cmd: echo
        args: ["hello"]
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(def.steps.len(), 2);
        match &def.steps[0] {
            StepDef::Branch { condition, then, else_branch, .. } => {
                assert_eq!(condition, "1 == 1");
                assert_eq!(then.len(), 1);
                assert_eq!(else_branch.len(), 0);
            }
            _ => panic!("expected branch"),
        }
        match &def.steps[1] {
            StepDef::Loop { over, as_var, body, .. } => {
                assert_eq!(over, "maybe.taken");
                assert_eq!(as_var, "item");
                assert_eq!(body.len(), 1);
                match &body[0] {
                    StepDef::Shell { cmd, args, .. } => {
                        assert_eq!(cmd, "echo");
                        assert_eq!(args, &vec!["hello".to_string()]);
                    }
                    _ => panic!("expected shell"),
                }
            }
            _ => panic!("expected loop"),
        }
    }

    #[test]
    fn parse_prompt_user_yaml() {
        let yaml = r#"
name: Ask
steps:
  - id: pick
    type: prompt-user
    question: "Which {{x}}?"
    options:
      - apple
      - pear
    allow_free_text: true
  - id: free
    type: prompt-user
    question: "Any thoughts?"
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        match &def.steps[0] {
            StepDef::PromptUser { question, options, allow_free_text, .. } => {
                assert_eq!(question, "Which {{x}}?");
                assert_eq!(options, &vec!["apple".to_string(), "pear".to_string()]);
                assert!(*allow_free_text);
            }
            _ => panic!("expected prompt-user"),
        }
        match &def.steps[1] {
            StepDef::PromptUser { question, options, allow_free_text, .. } => {
                assert_eq!(question, "Any thoughts?");
                assert!(options.is_empty());
                assert!(!allow_free_text);
            }
            _ => panic!("expected prompt-user"),
        }
    }

    #[test]
    fn parse_web_fetch_yaml() {
        let yaml = r#"
name: Net
steps:
  - id: get
    type: web.fetch
    url: https://example.com/api
  - id: post
    type: web.fetch
    url: https://example.com/api
    method: POST
    headers:
      Content-Type: application/json
      X-Api-Key: "{{secret.key}}"
    body: '{"hello":"world"}'
    timeout_ms: 5000
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        match &def.steps[0] {
            StepDef::WebFetch { url, method, headers, body, timeout_ms, .. } => {
                assert_eq!(url, "https://example.com/api");
                assert_eq!(method, "GET"); // default
                assert!(headers.is_empty());
                assert!(body.is_none());
                assert_eq!(*timeout_ms, 30_000);
            }
            _ => panic!(),
        }
        match &def.steps[1] {
            StepDef::WebFetch { method, headers, body, timeout_ms, .. } => {
                assert_eq!(method, "POST");
                assert_eq!(headers.get("Content-Type").map(|s| s.as_str()), Some("application/json"));
                assert!(body.is_some());
                assert_eq!(*timeout_ms, 5000);
            }
            _ => panic!(),
        }
    }

    #[test]
    fn parse_workbook_step_yaml() {
        let yaml = r#"
name: WB
steps:
  - id: read
    type: workbook.read
    path: data.xlsx
    sheet: Q1
  - id: build
    type: workbook.from_markdown_table
    from_step: tables
    table_index: 0
    output: out.xlsx
    sheet_name: Generated
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        match &def.steps[0] {
            StepDef::WorkbookRead { path, sheet, .. } => {
                assert_eq!(path, "data.xlsx");
                assert_eq!(sheet.as_deref(), Some("Q1"));
            }
            _ => panic!(),
        }
        match &def.steps[1] {
            StepDef::WorkbookFromMarkdownTable {
                from_step, table_index, output, sheet_name, ..
            } => {
                assert_eq!(from_step, "tables");
                assert_eq!(*table_index, 0);
                assert_eq!(output, "out.xlsx");
                assert_eq!(sheet_name.as_deref(), Some("Generated"));
            }
            _ => panic!(),
        }
    }

    // Phase 6.2 + 6.4 — preflight estimator.

    #[test]
    fn preflight_walk_counts_top_level_claude_steps() {
        let yaml = r#"
name: Brief
steps:
  - id: greet
    type: claude
    prompt: "Say hello in three words."
  - id: summarize
    type: claude
    prompt: "Summarize the day."
    system: "You are concise."
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        let (calls, chars) = preflight_walk(&def.steps);
        assert_eq!(calls, 2);
        // "Say hello in three words." (25) + "Summarize the day." (18)
        // + "You are concise." (16) = 59 — exact equality keeps the
        // heuristic boundaries honest if someone changes the formula.
        assert_eq!(chars, 25 + 18 + 16);
    }

    #[test]
    fn preflight_walk_multiplies_loop_bodies() {
        let yaml = r#"
name: PerFile
steps:
  - id: each
    type: loop
    over: gather.files
    as: f
    max_iterations: 7
    body:
      - id: process
        type: claude
        prompt: "Process {{f}}."
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        let (calls, _chars) = preflight_walk(&def.steps);
        assert_eq!(calls, 7);
    }

    #[test]
    fn preflight_walk_uses_default_cap_when_unset() {
        let yaml = r#"
name: PerFile
steps:
  - id: each
    type: loop
    over: gather.files
    as: f
    body:
      - id: process
        type: claude
        prompt: "Process {{f}}."
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        let (calls, _chars) = preflight_walk(&def.steps);
        assert_eq!(calls, LOOP_DEFAULT_CAP);
    }

    #[test]
    fn preflight_log_lines_emits_warning_when_above_threshold() {
        let mut steps = Vec::new();
        for i in 0..15 {
            steps.push(StepDef::Claude {
                id: format!("c{i}"),
                prompt: "x".to_string(),
                system: None,
            });
        }
        let def = WorkflowDef {
            name: "Many".into(),
            description: None,
            steps,
            budget_warning_threshold: None,
        };
        let lines = preflight_log_lines(&def);
        assert!(lines.iter().any(|l| l.contains("⚠")), "expected warning line: {lines:?}");
        assert!(lines.iter().any(|l| l.contains("15 claude call")));
    }

    #[test]
    fn preflight_log_lines_silent_below_threshold() {
        let def = WorkflowDef {
            name: "Few".into(),
            description: None,
            steps: vec![StepDef::Claude {
                id: "c0".into(),
                prompt: "x".into(),
                system: None,
            }],
            budget_warning_threshold: None,
        };
        let lines = preflight_log_lines(&def);
        assert!(!lines.iter().any(|l| l.contains("⚠")), "no warning expected: {lines:?}");
    }

    #[test]
    fn preflight_log_lines_offline_when_no_claude_steps() {
        let yaml = r#"
name: Offline
steps:
  - id: read
    type: file.read
    path: /tmp/x.txt
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        let lines = preflight_log_lines(&def);
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("offline"));
    }

    #[test]
    fn preflight_log_lines_respects_custom_threshold() {
        let yaml = r#"
name: Custom
budget_warning_threshold: 2
steps:
  - id: c1
    type: claude
    prompt: x
  - id: c2
    type: claude
    prompt: y
  - id: c3
    type: claude
    prompt: z
"#;
        let def: WorkflowDef = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(def.budget_warning_threshold, Some(2));
        let lines = preflight_log_lines(&def);
        assert!(lines.iter().any(|l| l.contains("⚠")));
    }
}
