//! The house style agents write plans to. It belongs to the app, not to the
//! plan base: a base is plans and their history, and shipping the standards
//! inside one would make every base carry its own drifting copy of a document
//! nobody edited.
//!
//! What the user can change is layered on top rather than replacing it, so a
//! new build's improvements still reach someone who added a rule of their own.

/// Ships with the app. Read by agents before they file a plan.
pub const BUILT_IN: &str = include_str!("standards.md");

/// What agents are told: the built-in standards, plus whatever the user added.
pub fn effective(overrides: Option<&str>) -> String {
    match overrides.map(str::trim).filter(|s| !s.is_empty()) {
        Some(extra) => format!("{BUILT_IN}\n## Also, for this person\n\n{extra}\n"),
        None => BUILT_IN.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_additions_agents_get_exactly_what_ships() {
        assert_eq!(effective(None), BUILT_IN);
        assert_eq!(effective(Some("   ")), BUILT_IN);
    }

    #[test]
    fn additions_are_layered_on_rather_than_replacing() {
        let combined = effective(Some("Always name the reviewer."));

        assert!(combined.starts_with(BUILT_IN));
        assert!(combined.contains("Always name the reviewer."));
    }
}
