//! The demo folder: one plan about a made-up notes app at every stage, so a
//! new board has a card in each column and the tour has a plan to show each
//! flow on. `demo: true` in their frontmatter keeps agents off them.

use crate::base::Base;
use crate::comments::{self, CommentThread};
use crate::fs::atomic_write;
use crate::import::now_iso;
use crate::library;
use crate::repo::{self, Author};
use crate::work::{self, WorkRecord};
use serde_json::Value;
use std::path::PathBuf;

/// The question roles asked when the person has not said what they do.
pub const DEFAULT_PANEL: [&str; 4] = ["product", "engineering", "design", "oncall"];

/// Writes each demo plan that is missing from the base, with its sidecars,
/// and commits them. A demo plan already in the base, or any file at a demo
/// plan's path, is left as it is, so a person's changes stand. `panel` is the
/// question roles of the person's panel. The alignment plan asks one
/// question from each, in that order. Returns the plans written.
pub fn seed_demo(base: &Base, panel: &[&str]) -> Result<Vec<PathBuf>, String> {
    let present = demo_ids(base);
    let now = now_iso();
    let mut written = Vec::new();
    for demo in &DEMOS {
        let path = base.plans_dir().join(demo.file);
        if path.exists() || present.iter().any(|id| demo.file == format!("{id}.md")) {
            continue;
        }
        atomic_write(&path, &demo.plan.replace(NOW, &now))?;
        if let Some(template) = demo.work {
            work::write(&path, &work_record(template, &now, panel)?)?;
        }
        if let Some(template) = demo.comments {
            comments::write_threads(&path, &threads(template, &now)?)?;
        }
        written.push(path);
    }
    if !written.is_empty() {
        repo::commit_all(&base.root, &Author::app(), "add: demo plans")?;
    }
    Ok(written)
}

/// One demo plan and its sidecars, as written before the seed stamps them.
struct Demo {
    file: &'static str,
    plan: &'static str,
    work: Option<&'static str>,
    /// The thread list alone. The sidecar's version is added on write.
    comments: Option<&'static str>,
}

/// In the order the board's columns run.
const DEMOS: [Demo; 5] = [
    Demo {
        file: "demo-add-dark-mode.md",
        plan: include_str!("demo-add-dark-mode.md"),
        work: None,
        comments: None,
    },
    Demo {
        file: "demo-export-notes-as-pdf.md",
        plan: include_str!("demo-export-notes-as-pdf.md"),
        work: Some(include_str!("demo-export-notes-as-pdf.work.json")),
        comments: Some(include_str!("demo-export-notes-as-pdf.comments.json")),
    },
    Demo {
        file: "demo-sync-notes-across-devices.md",
        plan: include_str!("demo-sync-notes-across-devices.md"),
        work: Some(include_str!("demo-sync-notes-across-devices.work.json")),
        comments: None,
    },
    Demo {
        file: "demo-faster-search.md",
        plan: include_str!("demo-faster-search.md"),
        work: Some(include_str!("demo-faster-search.work.json")),
        comments: None,
    },
    Demo {
        file: "demo-keyboard-shortcuts.md",
        plan: include_str!("demo-keyboard-shortcuts.md"),
        work: Some(include_str!("demo-keyboard-shortcuts.work.json")),
        comments: None,
    },
];

/// Stands for the moment of the seed in every template.
const NOW: &str = "{now}";

/// The ids of the demo plans anywhere in the base.
fn demo_ids(base: &Base) -> Vec<String> {
    library::scan(base)
        .into_iter()
        .filter(|entry| entry.meta.demo)
        .map(|entry| entry.meta.id)
        .collect()
}

/// The template's record, its alignment narrowed to the panel. Narrowed as
/// JSON before it is typed, so only the panel's roles have to be ones `Role`
/// can read.
fn work_record(template: &str, now: &str, panel: &[&str]) -> Result<WorkRecord, String> {
    let mut record: Value = serde_json::from_str(&template.replace(NOW, now))
        .map_err(|e| format!("A demo work record does not read: {e}"))?;
    if let Some(questions) = record.pointer_mut("/alignment/questions") {
        *questions = panel_questions(questions, panel);
    }
    serde_json::from_value(record).map_err(|e| format!("A demo work record does not read: {e}"))
}

/// One question per panel role, numbered in the panel's order. The first
/// keeps its option and reason. The second is answered in the person's own
/// words, as "Write my own" does. The rest stay open, so the score sits below
/// the target and Build shows what is missing.
fn panel_questions(all: &Value, panel: &[&str]) -> Value {
    let all = all.as_array().map_or(&[][..], Vec::as_slice);
    panel
        .iter()
        .filter_map(|role| all.iter().find(|q| q["role"] == *role))
        .enumerate()
        .map(|(at, question)| {
            let mut question = question.clone();
            question["id"] = Value::from(format!("q{}", at + 1));
            match at {
                0 => {}
                1 => question["answer"] = written_answer(&question),
                _ => {
                    if let Some(fields) = question.as_object_mut() {
                        fields.remove("answer");
                        fields.remove("answeredBy");
                    }
                }
            }
            question
        })
        .collect()
}

/// The template's picked option and reason, as the person would write them.
fn written_answer(question: &Value) -> Value {
    let picked = &question["answer"]["options"][0];
    let label = question["options"]
        .as_array()
        .and_then(|options| options.iter().find(|o| o["id"] == *picked))
        .and_then(|option| option["label"].as_str())
        .unwrap_or_default();
    let note = question["answer"]["note"].as_str().unwrap_or_default();
    serde_json::json!({ "kind": "text", "text": format!("{label}. {note}") })
}

fn threads(template: &str, now: &str) -> Result<Vec<CommentThread>, String> {
    serde_json::from_str(&template.replace(NOW, now))
        .map_err(|e| format!("The demo comments do not read: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::base::ensure_base;
    use crate::comments::{self, ThreadState};
    use crate::plan::{self, Status};
    use crate::work::{self, Answer, PrState, Role, TodoState, WorkRecord};
    use serde_json::Value;
    use std::path::Path;

    fn temp_base(name: &str) -> Base {
        // Named per process: every checkout on this machine shares one temp
        // directory, and a fixed name lets one run wipe another's.
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        ensure_base(&dir).unwrap()
    }

    fn read(path: &Path) -> String {
        std::fs::read_to_string(path).unwrap()
    }

    fn record(path: &Path) -> WorkRecord {
        work::read(path).unwrap().expect("a work record")
    }

    fn by_stage(paths: &[PathBuf], status: Status) -> PathBuf {
        paths
            .iter()
            .find(|path| plan::parse(&read(path), path).meta.status == status)
            .unwrap_or_else(|| panic!("no demo plan in {status:?}"))
            .clone()
    }

    #[test]
    fn a_fresh_base_gets_one_demo_plan_at_every_stage() {
        let base = temp_base("openplan-core-demo-fresh");

        let paths = seed_demo(&base, &DEFAULT_PANEL).unwrap();

        let statuses: Vec<Status> = paths
            .iter()
            .map(|path| plan::parse(&read(path), path).meta.status)
            .collect();
        assert_eq!(
            statuses,
            [Status::Draft, Status::Alignment, Status::InProgress, Status::InReview, Status::Completed]
        );
        for path in &paths {
            let text = read(path);
            let plan = plan::parse(&text, path);
            assert!(!plan.derived, "{path:?}");
            assert!(text.contains("\ndemo: true\n"), "{path:?}");
            assert!(plan.meta.demo, "{path:?}");
            assert_eq!(plan.meta.folders, ["Demo"], "{path:?}");
            assert_eq!(plan.meta.plan_type.as_deref(), Some("feature"), "{path:?}");
            assert_eq!(plan.meta.id, path.file_stem().unwrap().to_str().unwrap());
            assert_eq!(plan.meta.id, plan::slugify(&plan.meta.title), "named the way agents' plans are");
            assert!(!text.contains("{now}"), "{path:?}");
        }
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn the_demo_plans_are_committed_to_the_base() {
        let base = temp_base("openplan-core-demo-commit");

        let paths = seed_demo(&base, &DEFAULT_PANEL).unwrap();

        for path in &paths {
            let relative = path.strip_prefix(&base.root).unwrap();
            assert_eq!(crate::repo::history(&base.root, relative).unwrap().len(), 1, "{path:?}");
        }
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn the_alignment_plan_asks_only_the_given_panel() {
        let base = temp_base("openplan-core-demo-panel");
        let panel = ["oncall", "design", "engineering", "product"];

        let paths = seed_demo(&base, &panel).unwrap();

        assert_asks(&record(&by_stage(&paths, Status::Alignment)), &panel);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_designer_is_asked_by_the_designer_panel() {
        let base = temp_base("openplan-core-demo-designer");
        let panel = ["design", "research", "accessibility", "engineering"];

        let paths = seed_demo(&base, &panel).unwrap();

        assert_asks(&record(&by_stage(&paths, Status::Alignment)), &panel);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    /// One question per panel role in the panel's order. The first is
    /// answered with an option and a reason, the second in the person's own
    /// words, and the rest are open.
    fn assert_asks(record: &WorkRecord, panel: &[&str]) {
        let questions = &record.alignment.as_ref().unwrap().questions;
        let roles: Vec<&str> = questions.iter().filter_map(|q| q.role.as_ref().map(Role::as_str)).collect();
        assert_eq!(roles, panel, "in the panel's order");
        let ids: Vec<&str> = questions.iter().map(|q| q.id.as_str()).collect();
        assert_eq!(ids, ["q1", "q2", "q3", "q4"]);
        match &questions[0].answer {
            Some(Answer::Chosen { note: Some(note), .. }) => assert!(!note.is_empty()),
            other => panic!("q1 should be an option with a reason: {other:?}"),
        }
        match &questions[1].answer {
            Some(Answer::Text { text }) => assert!(!text.is_empty()),
            other => panic!("q2 should be written by the person: {other:?}"),
        }
        assert!(questions[..2].iter().all(|q| q.answered_by.is_some()));
        assert!(questions[2..].iter().all(|q| q.answer.is_none() && q.answered_by.is_none()));
        assert_eq!(work::pending_questions(record), 2);
    }

    #[test]
    fn every_demo_question_is_written_to_the_standards() {
        let base = temp_base("openplan-core-demo-questions");

        let paths = seed_demo(&base, &DEFAULT_PANEL).unwrap();

        let record = record(&by_stage(&paths, Status::Alignment));
        for question in &record.alignment.unwrap().questions {
            assert!(question.context.as_deref().is_some_and(|c| !c.is_empty()), "{}", question.id);
            assert!((2..=3).contains(&question.options.len()), "{}", question.id);
            assert!(question
                .options
                .iter()
                .all(|o| o.consequence.is_some() && o.tradeoff.is_some()));
            let recommended = question.recommended.as_deref().expect("a recommended option");
            assert!(question.options.iter().any(|o| o.id == recommended), "{}", question.id);
            assert!(!question.aspect.is_empty());
        }
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_second_seed_writes_nothing_and_commits_nothing() {
        let base = temp_base("openplan-core-demo-twice");
        let first = seed_demo(&base, &DEFAULT_PANEL).unwrap();
        std::fs::write(&first[0], "---\ntitle: Mine now\ndemo: true\n---\n# Mine now\n").unwrap();

        let second = seed_demo(&base, &DEFAULT_PANEL).unwrap();

        assert_eq!(second, Vec::<PathBuf>::new());
        assert!(read(&first[0]).contains("Mine now"), "what the person changed stays");
        let relative = first[0].strip_prefix(&base.root).unwrap();
        assert_eq!(crate::repo::history(&base.root, relative).unwrap().len(), 1, "the person's edit is left for them");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_reseed_writes_back_only_the_missing_plans() {
        let base = temp_base("openplan-core-demo-reseed");
        let first = seed_demo(&base, &DEFAULT_PANEL).unwrap();
        std::fs::remove_file(&first[1]).unwrap();
        crate::repo::commit_all(&base.root, &crate::repo::Author::user(), "delete").unwrap();
        let moved_on = read(&first[2]).replace("status: in-progress", "status: in-review");
        std::fs::write(&first[2], &moved_on).unwrap();

        let second = seed_demo(&base, &DEFAULT_PANEL).unwrap();

        assert_eq!(second, [first[1].clone()]);
        assert_eq!(plan::parse(&read(&first[1]), &first[1]).meta.status, Status::Alignment);
        assert_eq!(read(&first[2]), moved_on, "a plan moved to a later stage stays where it is");
        let relative = first[1].strip_prefix(&base.root).unwrap();
        let latest = &crate::repo::history(&base.root, relative).unwrap()[0];
        assert_eq!(latest.message, "add: demo plans", "the reseed is committed");
        assert_eq!(crate::repo::read_at(&base.root, relative, &latest.id).unwrap(), read(&first[1]));
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_demo_plan_kept_elsewhere_in_the_base_is_not_written_again() {
        let base = temp_base("openplan-core-demo-elsewhere");
        let first = seed_demo(&base, &DEFAULT_PANEL).unwrap();
        let kept = base.root.join("Kept").join("dark-mode.md");
        std::fs::create_dir_all(kept.parent().unwrap()).unwrap();
        std::fs::rename(&first[0], &kept).unwrap();

        assert_eq!(seed_demo(&base, &DEFAULT_PANEL).unwrap(), Vec::<PathBuf>::new());

        assert!(!first[0].exists());
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_plan_already_at_a_demo_path_is_never_overwritten() {
        let base = temp_base("openplan-core-demo-taken");
        let taken = base.plans_dir().join("demo-add-dark-mode.md");
        std::fs::write(&taken, "# My own dark mode plan\n").unwrap();

        let written = seed_demo(&base, &DEFAULT_PANEL).unwrap();

        assert_eq!(read(&taken), "# My own dark mode plan\n");
        assert_eq!(written.len(), DEMOS.len() - 1);
        assert!(!written.contains(&taken));
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn each_work_record_shows_its_stage() {
        let base = temp_base("openplan-core-demo-records");

        let paths = seed_demo(&base, &DEFAULT_PANEL).unwrap();

        assert!(work::read(&by_stage(&paths, Status::Draft)).unwrap().is_none(), "no review yet");
        let building = record(&by_stage(&paths, Status::InProgress));
        let states: Vec<TodoState> = building.todos.iter().map(|t| t.state).collect();
        for state in [TodoState::Open, TodoState::Doing, TodoState::Done, TodoState::Dropped] {
            assert!(states.contains(&state), "{state:?}");
        }
        assert!(building.todos.iter().all(|t| t.detail.is_some()));
        assert!(building
            .todos
            .iter()
            .filter(|t| t.state == TodoState::Dropped)
            .all(|t| t.reason.is_some()));
        assert_eq!(building.decisions.len(), 2);
        assert_eq!(building.prs.iter().map(|p| p.state).collect::<Vec<_>>(), [PrState::Open]);
        assert_eq!(building.repos[0].remote.as_deref(), Some("github.com/example/notes"));
        let reviewing = record(&by_stage(&paths, Status::InReview));
        assert_eq!(work::open_todos(&reviewing), 0);
        assert!(reviewing.todos.iter().all(|t| t.state == TodoState::Done));
        assert!(work::all_prs_merged(&reviewing));
        assert!(work::all_prs_merged(&record(&by_stage(&paths, Status::Completed))));
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn the_alignment_plan_has_an_answered_thread_and_a_resolved_one() {
        let base = temp_base("openplan-core-demo-threads");

        let paths = seed_demo(&base, &DEFAULT_PANEL).unwrap();

        let path = by_stage(&paths, Status::Alignment);
        let threads = comments::read_threads(&path);
        let states: Vec<ThreadState> = threads.iter().map(|t| t.state()).collect();
        assert_eq!(states, [ThreadState::Answered, ThreadState::Resolved]);
        let text = read(&path);
        let lines: Vec<&str> = text.lines().collect();
        for thread in &threads {
            let anchored = lines[thread.line_start as usize - 1..thread.line_end as usize].join("\n");
            assert!(anchored.contains(&thread.quote), "{} is anchored where its quote is", thread.id);
            assert!(!thread.pending, "sent with the first review");
        }
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn the_draft_plan_carries_every_kind_of_content() {
        let text = DEMOS[0].plan;

        for needed in ["\n| ", "```mermaid\n", "```html\n", "\n$$\n", "Try a comment"] {
            assert!(text.contains(needed), "{needed}");
        }
        let inline_math = text.lines().any(|line| line.matches("$$").count() >= 2);
        assert!(inline_math, "a formula inline on one line");
        assert!(!text.contains("http"), "the html fence never reaches the network");
    }

    #[test]
    fn every_template_reads_back_as_the_app_would_write_it() {
        for demo in &DEMOS {
            let path = Path::new(demo.file);
            let text = demo.plan.replace(NOW, "2026-11-01T10:00:00Z");
            assert_eq!(plan::serialize(&plan::parse(&text, path)), text, "{}", demo.file);
            if let Some(template) = demo.work {
                let value: Value = serde_json::from_str(&template.replace(NOW, "x")).unwrap();
                let typed: WorkRecord = serde_json::from_value(value.clone()).unwrap();
                assert_eq!(serde_json::to_value(typed).unwrap(), value, "{}", demo.file);
            }
            if let Some(template) = demo.comments {
                let value: Value = serde_json::from_str(&template.replace(NOW, "x")).unwrap();
                let typed: Vec<comments::CommentThread> = serde_json::from_value(value.clone()).unwrap();
                assert_eq!(serde_json::to_value(typed).unwrap(), value, "{}", demo.file);
            }
        }
    }

    #[test]
    fn every_template_follows_the_writing_rules() {
        for demo in &DEMOS {
            let plan = plan::parse(demo.plan, Path::new(demo.file));
            assert_eq!(crate::standards::missing_sections("feature", &plan.body), Vec::<&str>::new());
            for text in [Some(demo.plan), demo.work, demo.comments].into_iter().flatten() {
                assert_eq!(crate::standards::writing_faults(text), Vec::<String>::new(), "{}", demo.file);
            }
        }
    }

    #[test]
    fn there_is_a_question_for_every_role_a_panel_can_hold() {
        let value: Value = serde_json::from_str(DEMOS[1].work.unwrap()).unwrap();
        let roles: Vec<&str> = value["alignment"]["questions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|q| q["role"].as_str().unwrap())
            .collect();

        assert_eq!(
            roles,
            [
                "product", "engineering", "design", "oncall", "research", "accessibility", "data",
                "security", "support"
            ]
        );
    }
}
