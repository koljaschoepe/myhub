//! Arasul GUI — Tauri 2 backend entry.
//!
//! Module layout (see also `ipc/` for the IPC v1.0 freeze stubs):
//!   vault           — §2 credential vault (Phase 0.10)
//!   pty             — §6 pseudo-terminal (Phase 1.4, multi-id)
//!   fs              — §3 filesystem  (Phase 1.2)
//!   projects        — §4 project registry  (Phase 2.4)
//!   claude          — §5 claude launch + briefer  (Phase 1.5 / 3.2)
//!   platform        — §1 platform + config
//!   system          — §8 maintenance  (Phase 2.x)
//!   auto_launch     — §9 cross-OS installers  (Phase 4.5-4.7)
//!   updates         — §10 release feed + staging  (Phase 5.5)
//!   drive_watcher   — mount/eject event emitter  (Phase 1.8)

mod auto_launch;
mod claude;
mod drive_watcher;
mod fs;
mod github;
mod import;
mod ipc;
mod myhub;
mod platform;
mod projects;
mod providers;
mod pty;
mod safe_command;
mod search;
mod system;
mod updates;
mod vault;
mod workbook;
mod workflow;
mod workflow_db;

use providers::ProviderState;
use pty::PtyState;
use tauri::Manager;
use vault::VaultState;
use workbook::WorkbookState;
use workflow::WorkflowState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // tauri-plugin-single-instance MUST be registered first. On a second
    // launch attempt it surfaces the existing window instead of opening a
    // duplicate (which would race over vault.enc).
    //
    // Skip in debug builds — the dev binary shares the bundle id
    // (`de.unit-ix.arasul`) with the production /Applications/Arasul.app,
    // so a stale lock from a crashed production app would block every
    // `pnpm tauri dev` from showing a window (binary exits clean with no
    // panic). Production keeps the guard.
    #[cfg(all(desktop, not(debug_assertions)))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyState::new())
        .manage(VaultState::new())
        .manage(WorkbookState::new())
        .manage(WorkflowState::new())
        .manage(ProviderState::new())
        .setup(|app| {
            drive_watcher::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // §1 platform
            platform::get_platform,
            platform::get_config,
            platform::set_config,
            platform::detect_drive_root,
            // §2 vault
            vault::vault_exists,
            vault::vault_create,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_set_secret,
            vault::vault_get_secret,
            vault::vault_change_passphrase,
            // §3 fs
            fs::list_tree,
            fs::list_project_files,
            fs::read_file,
            fs::read_file_bytes,
            fs::write_file,
            fs::rename,
            fs::delete,
            fs::reveal_in_finder,
            // §3b import (drag-drop + dialog)
            import::import_file,
            // §3c search
            search::search_in_project,
            // §4 projects
            projects::list_projects,
            projects::create_project,
            projects::delete_project,
            projects::resolve_project,
            projects::project_import_github,
            projects::project_export_github,
            // §4b github (PAT-based, vaulted token, REST + git CLI)
            github::github_test_token,
            github::github_has_token,
            github::github_account,
            github::github_create_repo,
            github::github_pull,
            github::github_push,
            github::github_commit,
            github::github_undo_last_push,
            github::github_project_status,
            // §5 claude
            claude::launch_claude,
            claude::ask_briefer,
            claude::claude_inline_op,
            claude::claude_install_status,
            claude::claude_install,
            // §5c providers (Phase 5 of master plan — multi-provider abstraction)
            providers::commands::provider_list,
            providers::commands::provider_auth_status,
            providers::commands::provider_install,
            // §5b myhub-tui
            myhub::launch_myhub_tui,
            // §6 pty
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            // §8 system
            system::compile,
            system::verify,
            system::stats,
            system::health,
            // §9 auto-launch
            auto_launch::install_auto_launch,
            auto_launch::uninstall_auto_launch,
            auto_launch::is_auto_launch_installed,
            // §10 updates
            updates::check_for_update,
            updates::download_and_stage_update,
            updates::apply_pending_update,
            // §11 workbook (Phase 2: spreadsheet axis)
            workbook::workbook_open,
            workbook::workbook_list_sheets,
            workbook::workbook_read_range,
            workbook::workbook_close,
            workbook::workbook_write_cells,
            workbook::workbook_save,
            // §12 workflow (Phase 3: workflow framework)
            workflow::workflow_list,
            workflow::workflow_get,
            workflow::workflow_run,
            workflow::workflow_status,
            workflow::workflow_abort,
            workflow::workflow_run_history,
            workflow::workflow_run_load,
            workflow::workflow_run_delete,
            workflow::workflow_prompt_response,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
