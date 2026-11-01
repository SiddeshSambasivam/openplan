//! Which agent tools this machine has.
//!
//! macOS asks the person before an app reads Documents, Downloads and the
//! other protected folders, so detection looks only at each tool's own
//! folder in the home directory.

use std::path::Path;

/// An agent tool OpenPlan can connect, and whether this machine has it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Agent {
    pub id: &'static str,
    pub name: &'static str,
    pub installed: bool,
}

/// Agent tools on this machine. Absent ones are reported too, so onboarding
/// can offer to connect what is missing rather than silently ignore it.
pub fn agents(home: &Path) -> Vec<Agent> {
    vec![
        Agent {
            id: "claude-code",
            name: "Claude Code",
            installed: home.join(".claude").is_dir(),
        },
        Agent {
            id: "codex",
            name: "Codex",
            installed: home.join(".codex").is_dir(),
        },
        Agent {
            id: "cursor",
            name: "Cursor",
            installed: home.join(".cursor").is_dir(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_home(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reports_which_agent_tools_this_machine_has() {
        let home = temp_home("openplan-core-discovery-agents");
        std::fs::create_dir_all(home.join(".claude")).unwrap();

        let found = agents(&home);

        let installed: Vec<_> = found.iter().map(|a| (a.id, a.installed)).collect();
        assert_eq!(installed, [("claude-code", true), ("codex", false), ("cursor", false)]);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    #[test]
    fn detection_reads_nothing_outside_the_agents_own_folders() {
        use std::fs::{set_permissions, Permissions};
        use std::os::unix::fs::PermissionsExt;
        let home = temp_home("openplan-core-discovery-private");
        std::fs::create_dir_all(home.join(".codex")).unwrap();
        let private = ["Documents", "Downloads", "Music"];
        for folder in private {
            std::fs::create_dir_all(home.join(folder)).unwrap();
            set_permissions(home.join(folder), Permissions::from_mode(0o000)).unwrap();
        }
        // The home folder itself can be passed through but not listed, so
        // only a direct look at a known name gets an answer.
        set_permissions(&home, Permissions::from_mode(0o100)).unwrap();

        let found = agents(&home);

        set_permissions(&home, Permissions::from_mode(0o700)).unwrap();
        for folder in private {
            set_permissions(home.join(folder), Permissions::from_mode(0o700)).unwrap();
        }
        let installed: Vec<_> = found.iter().map(|a| (a.id, a.installed)).collect();
        assert_eq!(installed, [("claude-code", false), ("codex", true), ("cursor", false)]);
        let _ = std::fs::remove_dir_all(&home);
    }
}
