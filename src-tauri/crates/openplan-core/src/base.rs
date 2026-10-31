//! The plan base: one directory holding every plan, plus the settings and
//! standards that travel with it. It is created on first use without asking
//! anyone anything, so the app and the CLI can both assume it is there.

use crate::fs::atomic_write;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Hidden, because nobody should have to tend it by hand.
pub const BASE_DIR_NAME: &str = ".openplan";
pub const PLANS_DIR_NAME: &str = "plans";
pub const BASE_CONFIG_NAME: &str = "openplan.json";

/// Bumped only when the layout changes in a way older builds cannot read.
pub const SCHEMA_VERSION: u32 = 1;

/// Settings that belong to the base itself, so they travel with it.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct BaseConfig {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
}

/// Where the user's plans live, and what sits alongside them.
#[derive(Debug, Clone, PartialEq)]
pub struct Base {
    pub root: PathBuf,
}

impl Base {
    pub fn plans_dir(&self) -> PathBuf {
        self.root.join(PLANS_DIR_NAME)
    }

    pub fn config_path(&self) -> PathBuf {
        self.root.join(BASE_CONFIG_NAME)
    }
}

pub fn default_base_path(home: &Path) -> PathBuf {
    home.join(crate::profile::base_dir_name())
}

/// Creates whatever is missing and leaves whatever is already there alone, so
/// it is safe to call on every launch and from every tool.
pub fn ensure_base(root: &Path) -> Result<Base, String> {
    let base = Base {
        root: root.to_path_buf(),
    };
    std::fs::create_dir_all(base.plans_dir())
        .map_err(|e| format!("Couldn't create the plan base: {e}"))?;
    restrict_to_owner(root)?;

    if !base.config_path().exists() {
        let config = BaseConfig {
            schema_version: SCHEMA_VERSION,
        };
        let json = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Couldn't write the base settings: {e}"))?;
        atomic_write(&base.config_path(), &format!("{json}\n"))?;
    }
    Ok(base)
}

/// Plans are working notes about unreleased work, so the directory is the
/// owner's alone.
#[cfg(unix)]
fn restrict_to_owner(root: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(root, std::fs::Permissions::from_mode(0o700))
        .map_err(|e| format!("Couldn't secure the plan base: {e}"))
}

#[cfg(not(unix))]
fn restrict_to_owner(_root: &Path) -> Result<(), String> {
    Ok(())
}

pub fn read_base_config(base: &Base) -> Result<BaseConfig, String> {
    let raw = crate::fs::read_to_string(&base.config_path())?;
    serde_json::from_str(&raw).map_err(|e| format!("The base settings are unreadable: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        // Named per process: every checkout on this machine shares one
        // temp directory, and a fixed name lets one run wipe another's.
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_default_base_is_hidden_in_the_home_directory() {
        assert_eq!(
            default_base_path(Path::new("/Users/sid")),
            Path::new("/Users/sid").join(crate::profile::base_dir_name())
        );
    }

    #[test]
    fn creating_a_base_lays_out_plans_and_settings() {
        let home = temp_dir("openplan-core-base-new");
        let root = default_base_path(&home);

        let base = ensure_base(&root).unwrap();

        assert!(base.plans_dir().is_dir());
        assert!(base.config_path().is_file());
        assert_eq!(
            read_base_config(&base).unwrap(),
            BaseConfig {
                schema_version: SCHEMA_VERSION
            }
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn a_second_run_keeps_what_the_user_has_already_written() {
        let home = temp_dir("openplan-core-base-idempotent");
        let root = default_base_path(&home);
        let base = ensure_base(&root).unwrap();
        std::fs::write(base.plans_dir().join("a.md"), "# A plan").unwrap();

        ensure_base(&root).unwrap();

        assert_eq!(
            std::fs::read_to_string(base.plans_dir().join("a.md")).unwrap(),
            "# A plan"
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    #[test]
    fn the_base_is_readable_only_by_its_owner() {
        use std::os::unix::fs::PermissionsExt;
        let home = temp_dir("openplan-core-base-perms");
        let root = default_base_path(&home);

        ensure_base(&root).unwrap();

        let mode = std::fs::metadata(&root).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o700, "got {:o}", mode & 0o777);
        let _ = std::fs::remove_dir_all(&home);
    }
}
