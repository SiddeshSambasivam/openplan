//! The base is a git repository, so every change to a plan has an author and
//! can be read back later. Nothing here rewrites history: restoring an old
//! revision writes a new commit saying so.

use git2::{Repository, Signature};
use std::path::Path;

/// One person, as git records them. The email is what tells two people
/// apart once a base is shared, so it carries the identity and the name is
/// only what gets displayed.
#[derive(Debug, Clone, PartialEq)]
pub struct Identity {
    pub name: String,
    pub email: String,
}

/// Who made a change. Agents commit under their own name so `git log`
/// answers "which tool wrote this", while the email answers "for whom".
#[derive(Debug, Clone, PartialEq)]
pub struct Author {
    pub name: String,
    pub email: String,
}

/// Used when nobody has said who they are. Anything committed under this
/// stays anonymous forever, since history is never rewritten.
pub const ANONYMOUS: &str = "user";

impl Author {
    pub fn user() -> Author {
        Author::agent(ANONYMOUS)
    }

    pub fn agent(name: &str) -> Author {
        Author {
            name: name.to_string(),
            email: format!("{name}@openplan.local"),
        }
    }

    pub fn person(identity: &Identity) -> Author {
        Author {
            name: identity.name.clone(),
            email: identity.email.clone(),
        }
    }

    /// An agent working on one person's behalf: the name says which tool ran,
    /// the email says whose base it ran against.
    pub fn agent_for(tool: &str, identity: &Identity) -> Author {
        Author {
            name: tool.to_string(),
            email: identity.email.clone(),
        }
    }
}

/// One entry in a plan's history.
#[derive(Debug, Clone, PartialEq)]
pub struct Revision {
    pub id: String,
    pub author: String,
    /// Seconds since the epoch, as git records them.
    pub timestamp: i64,
    pub message: String,
}

fn open_or_init(root: &Path) -> Result<Repository, String> {
    Repository::open(root)
        .or_else(|_| Repository::init(root))
        .map_err(|e| format!("Couldn't open the plan base's history: {e}"))
}

pub fn init(root: &Path) -> Result<(), String> {
    open_or_init(root).map(|_| ())
}

/// Whether anything has been recorded yet — a base on its very first run has
/// no history, which reads differently from one that simply has no changes.
pub fn has_commits(root: &Path) -> bool {
    let Ok(repo) = Repository::open(root) else {
        return false;
    };
    let has = repo.head().ok().and_then(|head| head.target()).is_some();
    has
}

/// Commits everything currently in the base. Returns `None` when there was
/// nothing to commit, which is the common case and not a failure.
pub fn commit_all(root: &Path, author: &Author, message: &str) -> Result<Option<String>, String> {
    let repo = open_or_init(root)?;
    // A process killed mid-commit leaves the index locked forever — nothing
    // else can be holding it between our short, single-writer operations, so
    // a leftover lock is debris, not a writer.
    let lock = root.join(".git").join("index.lock");
    if lock.exists() {
        let _ = std::fs::remove_file(&lock);
    }
    let mut index = repo
        .index()
        .map_err(|e| format!("Couldn't read the history index: {e}"))?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("Couldn't stage the changes: {e}"))?;
    index
        .write()
        .map_err(|e| format!("Couldn't stage the changes: {e}"))?;

    let tree_id = index
        .write_tree()
        .map_err(|e| format!("Couldn't record the changes: {e}"))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("Couldn't record the changes: {e}"))?;

    let parent = repo
        .head()
        .ok()
        .and_then(|head| head.target())
        .and_then(|oid| repo.find_commit(oid).ok());

    // An unchanged tree means nothing happened; committing anyway would fill
    // the history with entries that show no diff.
    if let Some(parent) = &parent {
        if parent.tree_id() == tree_id {
            return Ok(None);
        }
    }

    let signature = Signature::now(&author.name, &author.email)
        .map_err(|e| format!("Couldn't sign the change: {e}"))?;
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let oid = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parents,
        )
        .map_err(|e| format!("Couldn't record the change: {e}"))?;
    Ok(Some(oid.to_string()))
}

/// The revisions that touched one plan, newest first.
pub fn history(root: &Path, relative_path: &Path) -> Result<Vec<Revision>, String> {
    let repo = open_or_init(root)?;
    let mut walk = repo
        .revwalk()
        .map_err(|e| format!("Couldn't read the history: {e}"))?;
    if walk.push_head().is_err() {
        return Ok(Vec::new()); // no commits yet
    }

    let mut revisions = Vec::new();
    for oid in walk {
        let oid = oid.map_err(|e| format!("Couldn't read the history: {e}"))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Couldn't read the history: {e}"))?;
        if !commit_touched(&repo, &commit, relative_path) {
            continue;
        }
        revisions.push(Revision {
            id: oid.to_string(),
            author: commit.author().name().unwrap_or("unknown").to_string(),
            timestamp: commit.time().seconds(),
            message: commit.summary().ok().flatten().unwrap_or("").to_string(),
        });
    }
    Ok(revisions)
}

/// Every path an agent has committed to, in one walk of the history. Read
/// once per scan rather than per plan: a base with a thousand plans would
/// otherwise walk the same commits a thousand times, and the whole point of
/// deriving the lifecycle is that it costs nothing to keep true.
pub fn agent_touched_paths(root: &Path) -> std::collections::HashSet<std::path::PathBuf> {
    let mut touched = std::collections::HashSet::new();
    let Ok(repo) = open_or_init(root) else {
        return touched;
    };
    let Ok(mut walk) = repo.revwalk() else {
        return touched;
    };
    if walk.push_head().is_err() {
        return touched; // no commits yet
    }
    for oid in walk.flatten() {
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        if !crate::lifecycle::is_agent(commit.author().name().unwrap_or_default()) {
            continue;
        }
        let Ok(tree) = commit.tree() else { continue };
        let parent = commit.parent(0).ok().and_then(|p| p.tree().ok());
        let Ok(diff) = repo.diff_tree_to_tree(parent.as_ref(), Some(&tree), None) else {
            continue;
        };
        for delta in diff.deltas() {
            if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
                touched.insert(path.to_path_buf());
            }
        }
    }
    touched
}

fn commit_touched(repo: &Repository, commit: &git2::Commit, path: &Path) -> bool {
    let tree = match commit.tree() {
        Ok(tree) => tree,
        Err(_) => return false,
    };
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let mut options = git2::DiffOptions::new();
    options.pathspec(path);
    repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut options))
        .map(|diff| diff.deltas().len() > 0)
        .unwrap_or(false)
}

/// One line of a diff between a revision and the working file.
#[derive(Debug, Clone, PartialEq)]
pub struct DiffLine {
    /// ' ' context, '+' added since the revision, '-' removed since it.
    pub origin: char,
    pub text: String,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
}

/// What changed between a revision and the file as it is now, computed by
/// git's own diff so it matches what any git tool would say.
pub fn diff_since(
    root: &Path,
    relative_path: &Path,
    revision: &str,
) -> Result<Vec<DiffLine>, String> {
    let repo = open_or_init(root)?;
    let oid = git2::Oid::from_str(revision).map_err(|_| "That isn't a revision.".to_string())?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Couldn't find that revision: {e}"))?;
    let old_blob = commit
        .tree()
        .and_then(|t| t.get_path(relative_path).and_then(|e| repo.find_blob(e.id())))
        .ok();
    let current = std::fs::read(root.join(relative_path)).unwrap_or_default();
    let new_oid = repo
        .blob(&current)
        .map_err(|e| format!("Couldn't diff that revision: {e}"))?;
    let new_blob = repo
        .find_blob(new_oid)
        .map_err(|e| format!("Couldn't diff that revision: {e}"))?;

    let mut lines = Vec::new();
    repo.diff_blobs(
        old_blob.as_ref(),
        None,
        Some(&new_blob),
        None,
        None,
        None,
        None,
        None,
        Some(&mut |_delta, _hunk, line| {
            let origin = line.origin();
            if matches!(origin, ' ' | '+' | '-') {
                lines.push(DiffLine {
                    origin,
                    text: String::from_utf8_lossy(line.content())
                        .trim_end_matches('\n')
                        .to_string(),
                    old_line: line.old_lineno(),
                    new_line: line.new_lineno(),
                });
            }
            true
        }),
    )
    .map_err(|e| format!("Couldn't diff that revision: {e}"))?;
    Ok(lines)
}

/// A plan's content as of one revision.
pub fn read_at(root: &Path, relative_path: &Path, revision: &str) -> Result<String, String> {
    let repo = open_or_init(root)?;
    let oid = git2::Oid::from_str(revision).map_err(|_| "That isn't a revision.".to_string())?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Couldn't find that revision: {e}"))?;
    let entry = commit
        .tree()
        .map_err(|e| format!("Couldn't read that revision: {e}"))?
        .get_path(relative_path)
        .map_err(|_| "The plan didn't exist at that revision.".to_string())?;
    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| format!("Couldn't read that revision: {e}"))?;
    String::from_utf8(blob.content().to_vec())
        .map_err(|_| "That revision isn't valid UTF-8 text.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_repo(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        init(&dir).unwrap();
        dir
    }

    fn write(root: &Path, rel: &str, text: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn a_change_is_recorded_against_whoever_made_it() {
        let root = temp_repo("openplan-core-repo-author");
        write(&root, "plans/a.md", "# A");

        commit_all(&root, &Author::agent("claude-code"), "agent: create a").unwrap();

        let revisions = history(&root, Path::new("plans/a.md")).unwrap();
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].author, "claude-code");
        assert_eq!(revisions[0].message, "agent: create a");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn committing_with_nothing_changed_does_not_add_an_entry() {
        let root = temp_repo("openplan-core-repo-noop");
        write(&root, "plans/a.md", "# A");
        commit_all(&root, &Author::user(), "edit: a").unwrap();

        let second = commit_all(&root, &Author::user(), "edit: a again").unwrap();

        assert_eq!(second, None);
        assert_eq!(history(&root, Path::new("plans/a.md")).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn history_is_newest_first_and_only_the_plan_asked_for() {
        let root = temp_repo("openplan-core-repo-scope");
        write(&root, "plans/a.md", "# A");
        commit_all(&root, &Author::user(), "edit: a").unwrap();
        write(&root, "plans/b.md", "# B");
        commit_all(&root, &Author::user(), "edit: b").unwrap();
        write(&root, "plans/a.md", "# A revised");
        commit_all(&root, &Author::agent("codex"), "agent: update a").unwrap();

        let revisions = history(&root, Path::new("plans/a.md")).unwrap();

        let messages: Vec<&str> = revisions.iter().map(|r| r.message.as_str()).collect();
        assert_eq!(messages, vec!["agent: update a", "edit: a"]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_earlier_revision_can_be_read_back() {
        let root = temp_repo("openplan-core-repo-read-at");
        write(&root, "plans/a.md", "# First");
        commit_all(&root, &Author::user(), "edit: a").unwrap();
        write(&root, "plans/a.md", "# Second");
        commit_all(&root, &Author::user(), "edit: a").unwrap();

        let revisions = history(&root, Path::new("plans/a.md")).unwrap();
        let oldest = &revisions.last().unwrap().id;

        assert_eq!(read_at(&root, Path::new("plans/a.md"), oldest).unwrap(), "# First");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_diff_says_what_changed_since_a_revision() {
        let root = temp_repo("openplan-core-repo-diff");
        write(&root, "plans/a.md", "# A\n\nkeep this\ndrop this\n");
        commit_all(&root, &Author::user(), "edit: a").unwrap();
        write(&root, "plans/a.md", "# A\n\nkeep this\nadd this\n");

        let revisions = history(&root, Path::new("plans/a.md")).unwrap();
        let lines = diff_since(&root, Path::new("plans/a.md"), &revisions[0].id).unwrap();

        let removed: Vec<&str> = lines.iter().filter(|l| l.origin == '-').map(|l| l.text.as_str()).collect();
        let added: Vec<&str> = lines.iter().filter(|l| l.origin == '+').map(|l| l.text.as_str()).collect();
        assert_eq!(removed, vec!["drop this"]);
        assert_eq!(added, vec!["add this"]);
        let context = lines.iter().find(|l| l.origin == ' ').unwrap();
        assert!(context.old_line.is_some() && context.new_line.is_some());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_plan_with_no_commits_has_an_empty_history() {
        let root = temp_repo("openplan-core-repo-empty");

        assert_eq!(history(&root, Path::new("plans/none.md")).unwrap(), vec![]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn only_the_paths_agents_committed_to_come_back() {
        let root = temp_repo("openplan-core-repo-agent-paths");
        std::fs::write(root.join("mine.md"), "# Mine\n").unwrap();
        commit_all(&root, &Author::user(), "add: mine").unwrap();
        std::fs::write(root.join("theirs.md"), "# Theirs\n").unwrap();
        commit_all(&root, &Author::agent("claude-code"), "add: theirs").unwrap();

        let touched = agent_touched_paths(&root);

        assert!(touched.contains(std::path::Path::new("theirs.md")));
        assert!(!touched.contains(std::path::Path::new("mine.md")));
        let _ = std::fs::remove_dir_all(&root);
    }
}
