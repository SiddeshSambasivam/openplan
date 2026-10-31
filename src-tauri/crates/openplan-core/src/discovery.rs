//! Finding plans that already exist, before OpenPlan knew about them.
//!
//! Two sources, in order of how much they yield: the folders where people
//! keep plans by hand, and the agent tools installed on this machine. Both
//! are scanned on demand during onboarding, so both are bounded — a scan that
//! walks a whole disk is one nobody waits for.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// An agent tool this machine has, and where it keeps anything plan-shaped.
#[derive(Debug, Clone, PartialEq)]
pub struct Agent {
    pub id: &'static str,
    pub name: &'static str,
    /// Present on this machine.
    pub installed: bool,
    /// Loose plan documents it writes, if it writes any.
    pub plans: Vec<PathBuf>,
}

/// A directory that looks like somewhere plans are kept.
#[derive(Debug, Clone, PartialEq)]
pub struct PlanFolder {
    pub path: PathBuf,
    /// Markdown directly inside, and in its immediate subdirectories.
    pub documents: usize,
    /// True when the folder's own name says plans; false when it is only
    /// suggested for being full of markdown.
    pub named_for_plans: bool,
}

/// Directories never worth descending into: big, and never where plans live.
const SKIP: [&str; 8] = [
    "node_modules", "Library", "target", "venv", ".venv",
    "dist", "build", "Applications",
];

/// How deep to look below each starting point. Plans live near the top of a
/// home directory; anything deeper is someone's source tree.
const MAX_DEPTH: usize = 3;

/// A folder whose name says nothing is still worth suggesting once it holds
/// this much markdown of its own.
const SUGGEST_MIN_DOCS: usize = 5;

/// More suggestions than this is a list nobody reads.
const MAX_FOLDERS: usize = 8;

fn looks_like_plans(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("plan") || lower.contains("spec") || lower.contains("rfc")
}

fn markdown_count(dir: &Path, depth: usize) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut count = 0;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        match entry.file_type() {
            Ok(t) if t.is_file() && path.extension().is_some_and(|e| e == "md") => count += 1,
            Ok(t) if t.is_dir() && depth > 0 => count += markdown_count(&path, depth - 1),
            _ => {}
        }
    }
    count
}

/// Agent tools on this machine. Absent ones are reported too, so onboarding
/// can offer to connect what is missing rather than silently ignore it.
pub fn agents(home: &Path) -> Vec<Agent> {
    let claude = home.join(".claude");
    let claude_plans = claude.join("plans");
    vec![
        Agent {
            id: "claude-code",
            name: "Claude Code",
            installed: claude.is_dir(),
            plans: list_markdown(&claude_plans),
        },
        Agent {
            id: "codex",
            name: "Codex",
            installed: home.join(".codex").is_dir(),
            // Codex records plans as a checklist of steps inside a session
            // transcript, not as a document, so there is nothing to file.
            plans: Vec::new(),
        },
        Agent {
            id: "cursor",
            name: "Cursor",
            installed: home.join(".cursor").is_dir(),
            plans: Vec::new(),
        },
    ]
}

fn list_markdown(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "md"))
        .collect();
    found.sort();
    found
}

/// Directories that look like somewhere plans are kept, searched breadth-first
/// from the usual places and stopped at `budget`. Onboarding runs this while
/// someone is reading the first screen, so it answers in well under a second.
pub fn plan_folders(home: &Path, budget: std::time::Duration) -> Vec<PlanFolder> {
    let started = Instant::now();
    let mut found: Vec<PlanFolder> = Vec::new();
    // The starting points overlap — Desktop is also reachable from home — so
    // the same folder can be arrived at twice.
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut queue: Vec<(PathBuf, usize)> = ["Desktop", "Documents", "Developer", "Projects", "src"]
        .iter()
        .map(|d| home.join(d))
        .chain(std::iter::once(home.to_path_buf()))
        .filter(|p| p.is_dir())
        .map(|p| (p, MAX_DEPTH))
        .collect();

    while let Some((dir, depth)) = queue.pop() {
        if started.elapsed() > budget {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        // One pass over the directory: gather its subfolders, and count the
        // markdown sitting directly in each — that count is what promotes a
        // folder whose name says nothing.
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy().to_string();
            if name.starts_with('.') || SKIP.contains(&name.as_str()) {
                continue;
            }
            if !entry.file_type().is_ok_and(|t| t.is_dir()) {
                continue;
            }
            let path = entry.path();
            if !seen.insert(path.clone()) {
                continue;
            }
            if looks_like_plans(&name) {
                let documents = markdown_count(&path, 1);
                if documents > 0 {
                    found.push(PlanFolder {
                        path,
                        documents,
                        named_for_plans: true,
                    });
                    continue; // its subdirectories belong to it
                }
            } else {
                let direct = markdown_count(&path, 0);
                if direct >= SUGGEST_MIN_DOCS {
                    found.push(PlanFolder {
                        documents: markdown_count(&path, 1),
                        path,
                        named_for_plans: false,
                    });
                    continue;
                }
            }
            if depth > 0 {
                queue.push((path, depth - 1));
            }
        }
    }
    // The confident ones first, each tier largest first.
    found.sort_by(|a, b| {
        b.named_for_plans
            .cmp(&a.named_for_plans)
            .then(b.documents.cmp(&a.documents))
    });
    found.truncate(MAX_FOLDERS);
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn reports_which_agent_tools_this_machine_has() {
        let home = temp_home("openplan-core-discovery-agents");
        std::fs::create_dir_all(home.join(".claude")).unwrap();

        let found = agents(&home);

        let claude = found.iter().find(|a| a.id == "claude-code").unwrap();
        let cursor = found.iter().find(|a| a.id == "cursor").unwrap();
        assert!(claude.installed);
        assert!(!cursor.installed, "cursor isn't on this machine");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn finds_the_loose_plans_claude_code_writes() {
        let home = temp_home("openplan-core-discovery-claude-plans");
        write(&home.join(".claude/plans/a.md"), "# A");
        write(&home.join(".claude/plans/b.md"), "# B");
        write(&home.join(".claude/plans/notes.txt"), "not markdown");

        let claude = agents(&home).into_iter().find(|a| a.id == "claude-code").unwrap();

        assert_eq!(claude.plans.len(), 2);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn finds_folders_whose_names_say_they_hold_plans() {
        let home = temp_home("openplan-core-discovery-folders");
        write(&home.join("Desktop/Hypo Fable Plans/a.md"), "# A");
        write(&home.join("Desktop/Hypo Fable Plans/set/b.md"), "# B");
        write(&home.join("Desktop/holiday photos/readme.md"), "# not plans");

        let found = plan_folders(&home, std::time::Duration::from_secs(5));

        assert_eq!(found.len(), 1, "{found:?}");
        assert!(found[0].path.ends_with("Hypo Fable Plans"));
        assert_eq!(found[0].documents, 2, "counts what is inside");
        assert!(found[0].named_for_plans);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn a_folder_named_for_plans_but_holding_none_is_not_offered() {
        let home = temp_home("openplan-core-discovery-empty-folder");
        std::fs::create_dir_all(home.join("Desktop/old plans")).unwrap();

        assert_eq!(plan_folders(&home, std::time::Duration::from_secs(5)), vec![]);

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn a_folder_full_of_markdown_is_suggested_even_without_the_name() {
        let home = temp_home("openplan-core-discovery-rich");
        for i in 0..6 {
            write(&home.join(format!("Documents/design docs/d{i}.md")), "# D");
        }
        write(&home.join("Documents/two notes/a.md"), "# A");

        let found = plan_folders(&home, std::time::Duration::from_secs(5));

        let rich = found.iter().find(|f| f.path.ends_with("design docs"));
        assert!(rich.is_some(), "{found:?}");
        assert!(!rich.unwrap().named_for_plans);
        assert!(
            !found.iter().any(|f| f.path.ends_with("two notes")),
            "a couple of files is not a plans folder: {found:?}"
        );
    }

    #[test]
    fn named_folders_come_before_merely_markdown_rich_ones() {
        let home = temp_home("openplan-core-discovery-order");
        for i in 0..9 {
            write(&home.join(format!("Documents/big notes/n{i}.md")), "# N");
        }
        write(&home.join("Desktop/plans/one.md"), "# One");

        let found = plan_folders(&home, std::time::Duration::from_secs(5));

        assert!(found[0].path.ends_with("plans"), "{found:?}");
        assert!(found[0].named_for_plans);
    }

    #[test]
    fn the_scan_stops_when_its_time_is_up() {
        let home = temp_home("openplan-core-discovery-budget");
        for i in 0..50 {
            write(&home.join(format!("Documents/d{i}/plans/a.md")), "# A");
        }

        // Zero budget: the first check ends it, so it returns rather than walks.
        let found = plan_folders(&home, std::time::Duration::ZERO);

        assert!(found.len() < 50, "walked everything anyway: {}", found.len());
        let _ = std::fs::remove_dir_all(&home);
    }
}
