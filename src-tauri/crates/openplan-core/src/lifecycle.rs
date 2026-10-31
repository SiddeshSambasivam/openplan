//! Where a plan stands. Three states, and only one of them is anyone's to
//! declare: a plan is Archived because a person said the work is finished.
//! Draft and Active are read off what has actually happened to the plan, so
//! they cannot drift from it the way a field someone has to maintain does.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

/// The tools that count as agents. A plan is Active once one of them has
/// touched it, whether it wrote the plan in the first place or edited it
/// later.
pub const AGENTS: [&str; 3] = ["claude-code", "codex", "cursor"];

pub fn is_agent(name: &str) -> bool {
    AGENTS.contains(&name)
}

/// The one tag the app interprets. Everything else anyone tags a plan with
/// is theirs to mean whatever they meant.
pub const ARCHIVED_TAG: &str = "archived";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lifecycle {
    /// Written, but no agent has worked on it yet.
    Draft,
    /// An agent has worked on it.
    Active,
    /// Someone said the work is done.
    Archived,
}

impl Lifecycle {
    pub fn as_str(&self) -> &'static str {
        match self {
            Lifecycle::Draft => "draft",
            Lifecycle::Active => "active",
            Lifecycle::Archived => "archived",
        }
    }
}

/// Archiving is a decision and outranks activity, so archiving a plan an
/// agent is working on still reads Archived. Otherwise a plan is Active if
/// an agent wrote it or has since touched it: `source` catches plans that
/// arrived by import, where the commit belongs to whoever imported them.
pub fn of(tags: &[String], source: &str, agent_touched: bool) -> Lifecycle {
    if tags.iter().any(|t| t == ARCHIVED_TAG) {
        return Lifecycle::Archived;
    }
    if agent_touched || is_agent(source) {
        return Lifecycle::Active;
    }
    Lifecycle::Draft
}

/// Whether one plan's path is among those agents have committed to. Set
/// membership rather than a per-plan history walk, because the whole base
/// is read in one pass.
///
/// A set is a folder, and its entry document stands for the whole thing, so
/// work on any document inside it is work on the plan. A single file only
/// ever matches itself: its parent is the plans directory, which every
/// other plan shares.
pub fn touched(
    agent_paths: &HashSet<std::path::PathBuf>,
    relative_path: &Path,
    is_set: bool,
) -> bool {
    if !is_set {
        return agent_paths.contains(relative_path);
    }
    match relative_path.parent() {
        Some(folder) if !folder.as_os_str().is_empty() => {
            agent_paths.iter().any(|p| p.starts_with(folder))
        }
        _ => agent_paths.contains(relative_path),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tags(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_plan_no_agent_has_touched_is_a_draft() {
        assert_eq!(of(&[], "manual", false), Lifecycle::Draft);
    }

    #[test]
    fn an_agent_commit_makes_a_plan_active() {
        assert_eq!(of(&[], "manual", true), Lifecycle::Active);
    }

    #[test]
    fn a_plan_an_agent_wrote_is_active_even_when_you_imported_it() {
        // The import commit belongs to whoever ran the import, so history
        // alone would call these drafts.
        assert_eq!(of(&[], "claude-code", false), Lifecycle::Active);
    }

    #[test]
    fn archiving_outranks_activity() {
        assert_eq!(of(&tags(["archived"].as_ref()), "claude-code", true), Lifecycle::Archived);
    }

    #[test]
    fn ordinary_tags_say_nothing_about_the_lifecycle() {
        assert_eq!(of(&tags(["infra", "search"].as_ref()), "manual", false), Lifecycle::Draft);
    }

    #[test]
    fn work_anywhere_inside_a_set_counts_as_work_on_the_plan() {
        let mut paths = HashSet::new();
        paths.insert(PathBuf::from("plans/pdb-overhaul/03-rollout.md"));

        assert!(touched(&paths, Path::new("plans/pdb-overhaul/README.md"), true));
        assert!(!touched(&paths, Path::new("plans/other-plan.md"), false));
    }

    #[test]
    fn a_single_file_plan_matches_only_itself() {
        let mut paths = HashSet::new();
        paths.insert(PathBuf::from("plans/auth.md"));

        assert!(touched(&paths, Path::new("plans/auth.md"), false));
        assert!(!touched(&paths, Path::new("plans/billing.md"), false));

        // Another set's documents are not this plan's work.
        assert!(!touched(&paths, Path::new("plans/elsewhere/README.md"), true));
    }
}
