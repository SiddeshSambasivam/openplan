//! The projects the base's plans belong to. The work is in openplan-core, so
//! the app and the CLI count them the same way.

use openplan_core::project::{self, ProjectSummary};
use openplan_core::settings;

#[tauri::command]
pub async fn list_projects() -> Result<Vec<ProjectSummary>, String> {
    Ok(project::list(&settings::resolve_default_base()?))
}
