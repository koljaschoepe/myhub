//! Embedded-PTY host — production-grade, multi-PTY.
//!
//! Phase 1 step 1.4 rewrite. Every PTY carries an opaque string id; the
//! frontend opens one PTY per terminal pane (chat/project/launch-claude).
//! Events are namespaced by id: `pty://{id}/data`, `pty://{id}/exit`.
//!
//! Backpressure: the reader thread blocks on the channel — in practice
//! the renderer consumes fast enough that this never stalls the PTY.
//! If we ever need bounded buffering we can switch to a `crossbeam_channel`
//! with a capacity. Not needed at Phase 1 scale.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;

use base64::Engine as _;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;

pub(crate) struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

/// Shared PTY state — a map of id → handle.
pub struct PtyState {
    inner: Arc<Mutex<HashMap<String, PtyHandle>>>,
}

impl PtyState {
    pub fn new() -> Self { Self { inner: Arc::new(Mutex::new(HashMap::new())) } }

    /// Clone the shared inner Arc so background threads (e.g. Claude
    /// token harvester) can check whether a PTY is still alive.
    pub(crate) fn shared(&self) -> Arc<Mutex<HashMap<String, PtyHandle>>> {
        Arc::clone(&self.inner)
    }
}

impl Default for PtyState {
    fn default() -> Self { Self::new() }
}

/// Check whether a PTY id is still registered in the given state.
pub(crate) fn is_alive_in(
    inner: &Arc<Mutex<HashMap<String, PtyHandle>>>,
    id: &str,
) -> bool {
    inner.lock().contains_key(id)
}

#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum PtyError {
    #[serde(rename = "pty_spawn")]
    Spawn { message: String },
    #[serde(rename = "pty_not_found")]
    NotFound { id: String },
    #[serde(rename = "pty_io")]
    Io { message: String },
}

type Result<T> = std::result::Result<T, PtyError>;

#[derive(Serialize, Clone)]
struct PtyDataEvent {
    data_b64: String,
}

#[derive(Serialize, Clone)]
struct PtyExitEvent {
    status: i32,
}

#[tauri::command]
pub fn pty_open(
    app: AppHandle,
    state: State<'_, PtyState>,
    cmd: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<String> {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows: rows.unwrap_or(DEFAULT_ROWS),
        cols: cols.unwrap_or(DEFAULT_COLS),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system
        .openpty(size)
        .map_err(|e| PtyError::Spawn { message: format!("openpty: {e}") })?;

    let mut builder = CommandBuilder::new(&cmd);
    if let Some(args) = args {
        builder.args(args);
    }
    if let Some(cwd) = cwd {
        builder.cwd(cwd);
    }
    if let Some(env) = env {
        for (k, v) in env {
            builder.env(k, v);
        }
    }

    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|e| PtyError::Spawn { message: format!("spawn {cmd}: {e}") })?;
    let child = Arc::new(Mutex::new(child));

    // Clone a reader before moving master into the handle.
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| PtyError::Io { message: format!("try_clone_reader: {e}") })?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| PtyError::Io { message: format!("take_writer: {e}") })?;

    let id = Uuid::new_v4().to_string();
    let handle = PtyHandle {
        master: pair.master,
        writer,
        child: Arc::clone(&child),
    };
    state.inner.lock().insert(id.clone(), handle);

    // Reader thread — streams bytes to the frontend as base64.
    {
        let app_r = app.clone();
        let id_r = id.clone();
        let state_r = Arc::clone(&state.inner);
        let child_r = Arc::clone(&child);
        let data_channel = format!("pty://{id_r}/data");
        let exit_channel = format!("pty://{id_r}/exit");
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            // Bail out if the frontend has gone away — keeps a dead webview
            // from CPU-spinning the reader thread forever.
            const MAX_CONSECUTIVE_EMIT_FAILS: u32 = 100;
            let mut emit_fails: u32 = 0;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                        if app_r.emit(&data_channel, PtyDataEvent { data_b64: b64 }).is_err() {
                            emit_fails += 1;
                            if emit_fails >= MAX_CONSECUTIVE_EMIT_FAILS {
                                break;
                            }
                        } else {
                            emit_fails = 0;
                        }
                    }
                    Err(_) => break,
                }
            }
            // Reader hit EOF — wait for child to exit, emit status, clean up.
            let status = {
                let mut c = child_r.lock();
                c.wait().map(|s| s.exit_code() as i32).unwrap_or(-1)
            };
            let _ = app_r.emit(&exit_channel, PtyExitEvent { status });
            state_r.lock().remove(&id_r);
        });
    }

    Ok(id)
}

#[tauri::command]
pub fn pty_write(
    state: State<'_, PtyState>,
    id: String,
    data: String,
) -> Result<()> {
    let mut guard = state.inner.lock();
    let handle = guard
        .get_mut(&id)
        .ok_or_else(|| PtyError::NotFound { id: id.clone() })?;
    handle
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| PtyError::Io { message: format!("write: {e}") })?;
    handle
        .writer
        .flush()
        .map_err(|e| PtyError::Io { message: format!("flush: {e}") })?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<()> {
    let guard = state.inner.lock();
    let handle = guard
        .get(&id)
        .ok_or_else(|| PtyError::NotFound { id: id.clone() })?;
    handle
        .master
        .resize(PtySize { cols, rows, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| PtyError::Io { message: format!("resize: {e}") })?;
    Ok(())
}

#[tauri::command]
pub fn pty_kill(state: State<'_, PtyState>, id: String) -> Result<()> {
    let mut guard = state.inner.lock();
    if let Some(handle) = guard.remove(&id) {
        let mut c = handle.child.lock();
        let _ = c.kill();
    }
    Ok(())
}
