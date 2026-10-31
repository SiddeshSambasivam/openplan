//! The projects the base's plans belong to. The work is in openplan-core, so
//! the app and the CLI count them the same way.

use openplan_core::project::{self, ProjectSummary};

#[tauri::command]
pub async fn list_projects(
    state: tauri::State<'_, crate::plans::BaseState>,
) -> Result<Vec<ProjectSummary>, String> {
    Ok(project::list(state.get()?))
}
