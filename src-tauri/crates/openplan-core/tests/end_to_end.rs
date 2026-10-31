//! The path a plan actually takes: an agent writes one, the app lists it,
//! someone asks for changes, and the history remembers who did what.

use openplan_core::base::ensure_base;
use openplan_core::plan;
use openplan_core::repo::{self, Author};
use openplan_core::{fs, library};

#[test]
fn a_plan_filed_by_an_agent_is_listed_reviewed_and_remembered() {
    let root = std::env::temp_dir().join("openplan-e2e");
    let _ = std::fs::remove_dir_all(&root);
    let base = ensure_base(&root).unwrap();
    repo::init(&base.root).unwrap();
    repo::commit_all(&base.root, &Author::user(), "init: plan base").unwrap();

    // An agent files a plan.
    let path = base.plans_dir().join("auth-refactor.md");
    fs::atomic_write(
        &path,
        "---\nid: auth-refactor\ntitle: Auth refactor\ntags: auth\nsource: claude-code\n---\n# Auth refactor\n\nSteps here.\n",
    )
    .unwrap();
    repo::commit_all(
        &base.root,
        &Author::agent("claude-code"),
        "agent(claude-code): create auth-refactor",
    )
    .unwrap();

    // The app lists it.
    let listed = library::scan(&base);
    let entry = listed
        .iter()
        .find(|e| e.meta.id == "auth-refactor")
        .expect("the plan should be listed");
    assert_eq!(entry.meta.title, "Auth refactor");
    assert_eq!(entry.meta.source, "claude-code");
    assert_eq!(entry.meta.tags, vec!["auth"]);

    // Someone tags it for review.
    let text = fs::read_to_string(&path).unwrap();
    let mut parsed = plan::parse(&text, &path);
    parsed.meta.tags = vec!["auth".into(), "needs-review".into()];
    fs::atomic_write(&path, &plan::serialize(&parsed)).unwrap();
    repo::commit_all(&base.root, &Author::user(), "tags: auth-refactor").unwrap();

    // The tag change left the body alone.
    let after = plan::parse(&fs::read_to_string(&path).unwrap(), &path);
    assert_eq!(after.meta.tags, vec!["auth", "needs-review"]);
    assert_eq!(after.body, "# Auth refactor\n\nSteps here.\n");

    // Search finds it by its text.
    let hits = library::search(&base, "steps here");
    assert_eq!(hits.len(), 1, "{hits:?}");
    assert_eq!(hits[0].title, "Auth refactor");

    // The history says who did what, newest first.
    let revisions = repo::history(&base.root, &entry.relative_path).unwrap();
    let authors: Vec<&str> = revisions.iter().map(|r| r.author.as_str()).collect();
    assert_eq!(authors, vec!["user", "claude-code"]);

    // And the plan as the agent first wrote it is still readable.
    let original = repo::read_at(&base.root, &entry.relative_path, &revisions[1].id).unwrap();
    assert!(original.contains("tags: auth\n"), "{original}");

    let _ = std::fs::remove_dir_all(&root);
}
