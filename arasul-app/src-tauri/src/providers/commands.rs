//! Tauri commands exposing the Provider abstraction to the frontend.

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::ipc::error::{ArasulError, Result};

use super::{install, AuthStatus, ProviderState, ProviderSummary};

#[tauri::command]
pub fn provider_list(state: State<'_, ProviderState>) -> Result<Vec<ProviderSummary>> {
    Ok(state.0.read().list_summaries())
}

#[derive(Debug, Serialize)]
pub struct ProviderAuthStatusResponse {
    pub id: String,
    pub status: AuthStatus,
}

#[tauri::command]
pub fn provider_auth_status(
    state: State<'_, ProviderState>,
    id: String,
) -> Result<ProviderAuthStatusResponse> {
    let registry = state.0.read();
    let provider = registry.get(&id).ok_or_else(|| ArasulError::Internal {
        message: format!("unknown provider: {id}"),
    })?;
    Ok(ProviderAuthStatusResponse {
        id: id.clone(),
        status: provider.auth_status(),
    })
}

#[tauri::command]
pub fn provider_install(
    app: AppHandle,
    state: State<'_, ProviderState>,
    id: String,
) -> Result<String> {
    let registry = state.0.read();
    let provider = registry.get(&id).ok_or_else(|| ArasulError::Internal {
        message: format!("unknown provider: {id}"),
    })?;
    install::spawn_install(app, provider)
}
