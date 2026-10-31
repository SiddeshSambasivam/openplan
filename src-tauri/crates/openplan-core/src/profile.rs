//! Which OpenPlan is running: the installed one, or one built from source.
//! A dev build keeps its own base, settings, and agent registrations, so
//! working on OpenPlan never disturbs the plans you keep in it.

/// Decided by the build rather than the environment, because an agent
/// spawns the CLI itself. A variable set in one shell would not reach it,
/// but a debug binary is a debug binary wherever it is launched from.
pub const fn is_dev() -> bool {
    cfg!(debug_assertions)
}

/// What this build calls itself everywhere a name could collide: the base
/// directory, the settings file, the MCP server, and the managed block in
/// an agent's rules file.
pub fn name() -> String {
    if is_dev() {
        "openplan-dev".to_string()
    } else {
        "openplan".to_string()
    }
}

/// The hidden directory in someone's home that holds the plan base.
pub fn base_dir_name() -> String {
    format!(".{}", name())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_name_agrees_on_which_build_this_is() {
        // Tests are a debug build, so this is the dev side of the fork; the
        // point is that one answer drives all of them.
        assert!(is_dev());
        assert_eq!(name(), "openplan-dev");
        assert_eq!(base_dir_name(), ".openplan-dev");
    }
}
