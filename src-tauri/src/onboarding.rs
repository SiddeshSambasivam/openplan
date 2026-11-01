//! First-run: who this is, what is installed, and connecting the tools they
//! chose. Install logic lives in openplan-core; these commands are the
//! interface's way in.

use openplan_core::base::Base;
use openplan_core::roles::{self, PersonRole};
use openplan_core::{demo, discovery, integrations, settings};
use serde::Serialize;
use std::path::{Path, PathBuf};

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

pub(crate) fn update_settings(
    change: impl FnOnce(&mut settings::Settings),
) -> Result<(), String> {
    update_settings_at(&settings::settings_path()?, change)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    name: Option<String>,
    onboarded: bool,
    role: Option<PersonRole>,
}

#[tauri::command]
pub async fn app_settings() -> Result<AppSettings, String> {
    app_settings_at(&settings::settings_path()?)
}

#[tauri::command]
pub async fn complete_onboarding(
    name: Option<String>,
    role: Option<PersonRole>,
) -> Result<(), String> {
    complete_onboarding_at(&settings::settings_path()?, name, role)
}

/// Agents read the new panel through `get_standards` from their next call.
#[tauri::command]
pub async fn set_role(role: Option<PersonRole>) -> Result<(), String> {
    set_role_at(&settings::settings_path()?, role)
}

/// Writes the demo plans once, asking from the person's panel. Returns the
/// plans written, none once they were seeded before.
#[tauri::command]
pub async fn seed_demo(
    state: tauri::State<'_, crate::plans::BaseState>,
) -> Result<Vec<PathBuf>, String> {
    seed_demo_at(&settings::settings_path()?, state.get()?)
}

/// Writes back the demo plans that are missing, for a replay of the tour,
/// even once they were seeded. Returns the plans written.
#[tauri::command]
pub async fn restore_demo(
    state: tauri::State<'_, crate::plans::BaseState>,
) -> Result<Vec<PathBuf>, String> {
    restore_demo_at(&settings::settings_path()?, state.get()?)
}

/// Dev only in spirit: puts the walkthrough back so it can be tested again.
#[tauri::command]
pub async fn reset_onboarding() -> Result<(), String> {
    update_settings(|s| s.onboarded = false)
}

/// Which agent tools this machine has. Reads only the tools' own folders,
/// so macOS never asks for access to the person's other folders.
#[tauri::command]
pub async fn detect_agents() -> Result<Vec<discovery::Agent>, String> {
    Ok(discovery::agents(&home()?))
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

fn update_settings_at(
    file: &Path,
    change: impl FnOnce(&mut settings::Settings),
) -> Result<(), String> {
    let mut saved = settings::read_settings(file)?
        .ok_or("OpenPlan hasn't created its settings yet.")?;
    change(&mut saved);
    settings::write_settings(file, &saved)
}

fn app_settings_at(file: &Path) -> Result<AppSettings, String> {
    let saved = settings::read_settings(file)?.unwrap_or_default();
    Ok(AppSettings {
        name: saved.name,
        onboarded: saved.onboarded,
        role: saved.role,
    })
}

fn complete_onboarding_at(
    file: &Path,
    name: Option<String>,
    role: Option<PersonRole>,
) -> Result<(), String> {
    update_settings_at(file, |s| {
        s.name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        s.role = role;
        s.onboarded = true;
    })
}

fn set_role_at(file: &Path, role: Option<PersonRole>) -> Result<(), String> {
    update_settings_at(file, |s| s.role = role)
}

/// Seeded is recorded in the settings, not read from the base, so plans the
/// person deleted stay deleted.
fn seed_demo_at(file: &Path, base: &Base) -> Result<Vec<PathBuf>, String> {
    let saved = settings::read_settings(file)?.unwrap_or_default();
    if saved.demo_seeded == Some(true) {
        return Ok(Vec::new());
    }
    restore_demo_at(file, base)
}

/// `seed_demo` writes only the plans that are missing, so what the person
/// changed on a demo plan stands.
fn restore_demo_at(file: &Path, base: &Base) -> Result<Vec<PathBuf>, String> {
    let saved = settings::read_settings(file)?.unwrap_or_default();
    let panel: Vec<&str> = match saved.role {
        Some(role) => roles::panel_of(role).panel.iter().map(|role| role.as_str()).collect(),
        None => demo::DEFAULT_PANEL.to_vec(),
    };
    let written = demo::seed_demo(base, &panel)?;
    update_settings_at(file, |s| s.demo_seeded = Some(true))?;
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use openplan_core::base::ensure_base;
    use openplan_core::demo::DEFAULT_PANEL;
    use openplan_core::{plan, work};

    /// A settings file and a base of their own, named per process: every
    /// checkout on this machine shares one temp directory.
    fn temp_home(name: &str) -> (PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join("settings.json");
        settings::write_settings(&file, &settings::Settings::default()).unwrap();
        (dir, file)
    }

    fn saved(file: &Path) -> settings::Settings {
        settings::read_settings(file).unwrap().unwrap()
    }

    fn alignment_roles(paths: &[PathBuf]) -> Vec<String> {
        let path = paths
            .iter()
            .find(|path| {
                let text = std::fs::read_to_string(path).unwrap();
                plan::parse(&text, path).meta.status == plan::Status::Alignment
            })
            .expect("a demo plan in alignment");
        let record = work::read(path).unwrap().expect("a work record");
        record
            .alignment
            .expect("an alignment")
            .questions
            .iter()
            .map(|q| q.role.as_ref().expect("a role").as_str().to_string())
            .collect()
    }

    fn plan_files(base: &Base) -> usize {
        std::fs::read_dir(base.plans_dir())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "md"))
            .count()
    }

    #[test]
    fn completing_onboarding_keeps_the_name_and_role() {
        let (dir, file) = temp_home("openplan-app-onboarding-complete");

        complete_onboarding_at(&file, Some("  Sid ".into()), Some(PersonRole::Designer)).unwrap();

        let s = saved(&file);
        assert_eq!(s.name.as_deref(), Some("Sid"));
        assert_eq!(s.role, Some(PersonRole::Designer));
        assert!(s.onboarded);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn skipping_the_name_and_role_stores_neither() {
        let (dir, file) = temp_home("openplan-app-complete-skipped");

        complete_onboarding_at(&file, Some("  ".into()), None).unwrap();

        let s = saved(&file);
        assert_eq!(s.name, None);
        assert_eq!(s.role, None);
        assert!(s.onboarded);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_role_can_be_set_and_cleared() {
        let (dir, file) = temp_home("openplan-app-set-role");

        set_role_at(&file, Some(PersonRole::Lead)).unwrap();
        assert_eq!(saved(&file).role, Some(PersonRole::Lead));

        set_role_at(&file, None).unwrap();
        assert_eq!(saved(&file).role, None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_demo_asks_from_the_persons_panel_and_is_marked_seeded() {
        let (dir, file) = temp_home("openplan-app-seed-role");
        set_role_at(&file, Some(PersonRole::Designer)).unwrap();
        let base = ensure_base(&dir.join("base")).unwrap();

        let paths = seed_demo_at(&file, &base).unwrap();

        assert_eq!(paths.len(), 5);
        assert_eq!(alignment_roles(&paths), ["design", "research", "accessibility", "engineering"]);
        assert_eq!(saved(&file).demo_seeded, Some(true));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn without_a_role_the_demo_asks_the_first_four() {
        let (dir, file) = temp_home("openplan-app-seed-default");
        let base = ensure_base(&dir.join("base")).unwrap();

        let paths = seed_demo_at(&file, &base).unwrap();

        assert_eq!(alignment_roles(&paths), DEFAULT_PANEL);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_seeded_demo_never_comes_back() {
        let (dir, file) = temp_home("openplan-app-seed-once");
        let base = ensure_base(&dir.join("base")).unwrap();
        for path in seed_demo_at(&file, &base).unwrap() {
            std::fs::remove_file(path).unwrap();
        }

        let again = seed_demo_at(&file, &base).unwrap();

        assert!(again.is_empty());
        assert_eq!(plan_files(&base), 0);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn restoring_the_demo_writes_back_the_deleted_plans_after_a_seed() {
        let (dir, file) = temp_home("openplan-app-restore-deleted");
        set_role_at(&file, Some(PersonRole::Designer)).unwrap();
        let base = ensure_base(&dir.join("base")).unwrap();
        for path in seed_demo_at(&file, &base).unwrap() {
            std::fs::remove_file(path).unwrap();
        }

        let paths = restore_demo_at(&file, &base).unwrap();

        assert_eq!(paths.len(), 5);
        assert_eq!(alignment_roles(&paths), ["design", "research", "accessibility", "engineering"]);
        assert_eq!(saved(&file).demo_seeded, Some(true));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn restoring_the_demo_leaves_the_plans_that_are_there() {
        let (dir, file) = temp_home("openplan-app-restore-kept");
        let base = ensure_base(&dir.join("base")).unwrap();
        let paths = seed_demo_at(&file, &base).unwrap();
        std::fs::write(&paths[0], "changed").unwrap();
        std::fs::remove_file(&paths[1]).unwrap();

        let restored = restore_demo_at(&file, &base).unwrap();

        assert_eq!(restored, [paths[1].clone()]);
        assert_eq!(std::fs::read_to_string(&paths[0]).unwrap(), "changed");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn app_settings_name_the_role_by_its_lowercase_id() {
        let (dir, file) = temp_home("openplan-app-settings-role");

        let before = serde_json::to_value(app_settings_at(&file).unwrap()).unwrap();
        set_role_at(&file, Some(PersonRole::Product)).unwrap();
        let after = serde_json::to_value(app_settings_at(&file).unwrap()).unwrap();

        assert_eq!(before["role"], serde_json::Value::Null);
        assert_eq!(after["role"], "product");
        let _ = std::fs::remove_dir_all(dir);
    }
}
