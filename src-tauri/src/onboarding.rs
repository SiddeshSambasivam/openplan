//! First-run: who this is, what is installed, what can be imported, and
//! connecting the tools they chose. Import and install logic live in
//! openplan-core; these commands are the interface's way in.

use openplan_core::import::{import_path, iso_from_unix, Outcome};
use openplan_core::repo::Author;
use openplan_core::{discovery, integrations, settings};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;

fn home() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Couldn't find your home directory.".to_string())
}

/// The CLI ships beside the app binary; that is what agent tools spawn.
fn cli_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("The app binary has no directory.")?;
    let cli = dir.join("openplan");
    if cli.is_file() {
        Ok(cli)
    } else {
        Err(format!("The openplan command isn't beside the app ({}).", cli.display()))
    }
}

fn read_settings() -> Result<Option<settings::Settings>, String> {
    settings::read_settings(&settings::settings_path()?)
}

fn update_settings(
    change: impl FnOnce(&mut settings::Settings),
) -> Result<(), String> {
    let path = settings::settings_path()?;
    let mut saved = settings::read_settings(&path)?
        .ok_or("OpenPlan hasn't created its settings yet.")?;
    change(&mut saved);
    settings::write_settings(&path, &saved)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    name: Option<String>,
    onboarded: bool,
}

#[tauri::command]
pub async fn app_settings() -> Result<AppSettings, String> {
    let saved = read_settings()?;
    Ok(AppSettings {
        name: saved.as_ref().and_then(|s| s.name.clone()),
        onboarded: saved.map(|s| s.onboarded).unwrap_or(false),
    })
}

#[tauri::command]
pub async fn complete_onboarding(name: Option<String>) -> Result<(), String> {
    update_settings(|s| {
        s.name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        s.onboarded = true;
    })
}

/// Dev only in spirit: puts the walkthrough back so it can be tested again.
#[tauri::command]
pub async fn reset_onboarding() -> Result<(), String> {
    update_settings(|s| s.onboarded = false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAgent {
    id: String,
    name: String,
    installed: bool,
    /// Loose plans this tool has written, importable directly.
    plans: Vec<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredFolder {
    path: PathBuf,
    documents: usize,
    named_for_plans: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sources {
    agents: Vec<DetectedAgent>,
    folders: Vec<DiscoveredFolder>,
}

#[tauri::command]
pub async fn discover_sources() -> Result<Sources, String> {
    let home = home()?;
    let agents = discovery::agents(&home)
        .into_iter()
        .map(|a| DetectedAgent {
            id: a.id.to_string(),
            name: a.name.to_string(),
            installed: a.installed,
            plans: a.plans,
        })
        .collect();
    let folders = discovery::plan_folders(&home, Duration::from_millis(400))
        .into_iter()
        .map(|f| DiscoveredFolder {
            path: f.path,
            documents: f.documents,
            named_for_plans: f.named_for_plans,
        })
        .collect();
    Ok(Sources { agents, folders })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    filed: usize,
    documents: usize,
    already_there: usize,
}

/// Files one path into the base. A folder of plans files each plan inside
/// it; a single document or a plan set files as one. `source` is who the
/// plans are from — an agent's id for its own, "import" otherwise.
#[tauri::command]
pub async fn import_source(
    path: String,
    source: String,
    state: tauri::State<'_, crate::plans::BaseState>,
) -> Result<Imported, String> {
    let base = state.get()?;
    let author = if source == "import" {
        settings::me()
    } else {
        Author::agent_for(&source, &settings::current_identity())
    };
    let now = iso_from_unix(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0) as i64,
    );
    let path = std::path::PathBuf::from(&path);
    let outcomes = if path.is_dir() {
        openplan_core::import::import_folder(base, &author, &source, &path, &now)?
    } else {
        vec![import_path(base, &author, &source, &path, &now)?]
    };
    let mut result = Imported {
        filed: 0,
        documents: 0,
        already_there: 0,
    };
    for outcome in outcomes {
        match outcome {
            Outcome::Filed { documents, .. } => {
                result.filed += 1;
                result.documents += documents;
            }
            Outcome::AlreadyThere { .. } => result.already_there += 1,
        }
    }
    Ok(result)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallStep {
    label: String,
    done: bool,
    detail: String,
}

#[tauri::command]
pub async fn install_tool(tool: String) -> Result<Vec<InstallStep>, String> {
    let home = home()?;
    let cli = cli_path()?;
    let steps = match tool.as_str() {
        "claude-code" => integrations::install_claude_code(&home, &cli, false)?,
        "codex" => integrations::install_codex(&home, &cli)?,
        "cursor" => integrations::install_cursor(&home, &cli)?,
        other => return Err(format!("No such tool: {other}")),
    };
    Ok(steps
        .into_iter()
        .map(|s| InstallStep {
            label: s.label,
            done: s.done,
            detail: s.detail,
        })
        .collect())
}
