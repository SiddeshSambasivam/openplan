//! Where the plan base is. Kept outside the base itself, since it is what
//! tells the app and the CLI where to look — and both have to agree without
//! talking to each other.

use crate::base::{default_base_path, ensure_base, Base};
use crate::repo::{self, Author};
use crate::fs::atomic_write;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct Settings {
    #[serde(rename = "basePath")]
    pub base_path: PathBuf,
    /// Added to the standards that ship with the app. Absent for everyone who
    /// has not written any.
    #[serde(rename = "standards", default, skip_serializing_if = "Option::is_none")]
    pub standards: Option<String>,
}

/// `~/.config/openplan/settings.json`, or the platform's equivalent.
pub fn settings_path() -> Result<PathBuf, String> {
    let dir = dirs::config_dir()
        .ok_or_else(|| "Couldn't find this system's configuration directory.".to_string())?;
    Ok(dir.join("openplan").join("settings.json"))
}

/// `None` when OpenPlan has never run here, which is not an error.
pub fn read_settings(path: &Path) -> Result<Option<Settings>, String> {
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map(Some)
            .map_err(|e| format!("The OpenPlan settings are unreadable: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Couldn't read the OpenPlan settings: {e}")),
    }
}

pub fn write_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Couldn't create the settings directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Couldn't write the OpenPlan settings: {e}"))?;
    atomic_write(path, &format!("{json}\n"))
}

/// The base this machine should use, found the way a running app finds it.
pub fn resolve_default_base() -> Result<Base, String> {
    let home = dirs::home_dir().ok_or_else(|| "Couldn't find your home directory.".to_string())?;
    resolve_base(&settings_path()?, &home)
}

/// Standards used to be written into the base. They belong to the app now, so
/// the copy we left behind is taken back out — after the base has been
/// committed, so it stays recoverable in the history. A standards file someone
/// wrote themselves does not start the way ours did, and is left alone.
fn retire_standards_file(base: &Base) -> Result<bool, String> {
    let path = base.root.join("STANDARDS.md");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Ok(false);
    };
    if !text.starts_with("# Plan standards") {
        return Ok(false);
    }
    std::fs::remove_file(&path)
        .map_err(|e| format!("Couldn't retire the old standards file: {e}"))?;
    Ok(true)
}

/// The base this machine should use: whichever one was chosen before, or a
/// fresh one in the home directory. Either way it exists by the time this
/// returns, and the choice is recorded so the next caller agrees.
pub fn resolve_base(settings_file: &Path, home: &Path) -> Result<Base, String> {
    let existing = read_settings(settings_file)?;
    let chosen = existing
        .as_ref()
        .map(|s| s.base_path.clone())
        .unwrap_or_else(|| default_base_path(home));
    let base = ensure_base(&chosen)?;

    // Record whatever is in the base before touching it, so the first run has
    // a history and anything changed outside the app is captured rather than
    // rolled into someone's next edit.
    repo::init(&base.root)?;
    let first_run = !repo::has_commits(&base.root);
    repo::commit_all(
        &base.root,
        &Author::user(),
        if first_run {
            "init: plan base"
        } else {
            "sync: changes made outside OpenPlan"
        },
    )?;
    if retire_standards_file(&base)? {
        repo::commit_all(
            &base.root,
            &Author::user(),
            "remove: standards moved into OpenPlan's settings",
        )?;
    }

    write_settings(
        settings_file,
        &Settings {
            base_path: base.root.clone(),
            standards: existing.and_then(|s| s.standards),
        },
    )?;
    Ok(base)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn absent_settings_are_not_an_error() {
        let dir = temp_dir("openplan-core-settings-absent");

        assert_eq!(read_settings(&dir.join("settings.json")).unwrap(), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_chosen_base_is_read_back() {
        let dir = temp_dir("openplan-core-settings-roundtrip");
        let file = dir.join("nested").join("settings.json");
        let settings = Settings {
            base_path: PathBuf::from("/somewhere/plans"),
            standards: Some("Name the reviewer.".to_string()),
        };

        write_settings(&file, &settings).unwrap();

        assert_eq!(read_settings(&file).unwrap(), Some(settings));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_first_run_creates_a_base_in_the_home_directory_and_remembers_it() {
        let dir = temp_dir("openplan-core-settings-first-run");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");

        let base = resolve_base(&file, &home).unwrap();

        assert_eq!(base.root, home.join(".openplan"));
        assert!(base.plans_dir().is_dir());
        assert_eq!(
            read_settings(&file).unwrap().unwrap().base_path,
            home.join(".openplan")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolving_the_base_does_not_discard_the_standards_someone_wrote() {
        let dir = temp_dir("openplan-core-settings-keeps-standards");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");
        write_settings(
            &file,
            &Settings {
                base_path: default_base_path(&home),
                standards: Some("Name the reviewer.".to_string()),
            },
        )
        .unwrap();

        resolve_base(&file, &home).unwrap();

        assert_eq!(
            read_settings(&file).unwrap().unwrap().standards.as_deref(),
            Some("Name the reviewer.")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_standards_file_earlier_builds_left_behind_is_taken_back_out() {
        let dir = temp_dir("openplan-core-settings-retire");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");
        let base = ensure_base(&default_base_path(&home)).unwrap();
        let standards = base.root.join("STANDARDS.md");
        std::fs::write(&standards, "# Plan standards\n\nold copy\n").unwrap();

        resolve_base(&file, &home).unwrap();

        assert!(!standards.exists());
        // Recorded before removal, so it can still be read back.
        let revisions = repo::history(&base.root, Path::new("STANDARDS.md")).unwrap();
        assert!(!revisions.is_empty(), "the file was removed without a trace");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_standards_file_someone_wrote_themselves_is_left_alone() {
        let dir = temp_dir("openplan-core-settings-keep-theirs");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let base = ensure_base(&default_base_path(&home)).unwrap();
        let standards = base.root.join("STANDARDS.md");
        std::fs::write(&standards, "# How we write plans on this team\n").unwrap();

        resolve_base(&dir.join("settings.json"), &home).unwrap();

        assert!(standards.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_recorded_base_is_used_instead_of_the_default() {
        let dir = temp_dir("openplan-core-settings-relocated");
        let home = dir.join("home");
        let elsewhere = dir.join("Dropbox").join("plans");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");
        write_settings(
            &file,
            &Settings {
                base_path: elsewhere.clone(),
                standards: None,
            },
        )
        .unwrap();

        let base = resolve_base(&file, &home).unwrap();

        assert_eq!(base.root, elsewhere);
        assert!(elsewhere.join("plans").is_dir());
        assert!(!home.join(".openplan").exists(), "the default was created anyway");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
