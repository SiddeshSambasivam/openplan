//! Where the plan base is. Kept outside the base itself, since it is what
//! tells the app and the CLI where to look — and both have to agree without
//! talking to each other.

use crate::base::{default_base_path, ensure_base, Base};
use crate::fs::atomic_write;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    #[serde(rename = "basePath")]
    pub base_path: PathBuf,
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

/// The base this machine should use: whichever one was chosen before, or a
/// fresh one in the home directory. Either way it exists by the time this
/// returns, and the choice is recorded so the next caller agrees.
pub fn resolve_base(settings_file: &Path, home: &Path) -> Result<Base, String> {
    let chosen = read_settings(settings_file)?
        .map(|s| s.base_path)
        .unwrap_or_else(|| default_base_path(home));
    let base = ensure_base(&chosen)?;
    write_settings(
        settings_file,
        &Settings {
            base_path: base.root.clone(),
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
