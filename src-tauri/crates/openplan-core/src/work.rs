//! The work record: repos, alignment, decisions, todos and PRs for one plan,
//! in a JSON sidecar beside it. Agents and the app both write it, so every
//! change goes through `modify`, which holds a lock across the read and the
//! write.

use crate::fs::{atomic_write, friendly_read_error, friendly_write_error};
use crate::import::now_iso;
use crate::sidecar::sidecar_path;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const WORK_SUFFIX: &str = "oplan-work.json";
const LOCK_SUFFIX: &str = "oplan-work.json.lock";
const VERSION: u32 = 1;
/// How long a writer waits for another one before giving up.
const LOCK_TIMEOUT: Duration = Duration::from_secs(5);
const LOCK_RETRY: Duration = Duration::from_millis(10);
/// A real write holds the lock for milliseconds. One this old was left by a
/// process that died mid-write.
const STALE_LOCK: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkRecord {
    pub version: u32,
    pub repos: Vec<Repo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alignment: Option<Alignment>,
    pub decisions: Vec<Decision>,
    pub todos: Vec<Todo>,
    pub prs: Vec<Pr>,
    /// Fields a newer version wrote. Kept so a rewrite does not drop them.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for WorkRecord {
    fn default() -> Self {
        WorkRecord {
            version: VERSION,
            repos: Vec::new(),
            alignment: None,
            decisions: Vec::new(),
            todos: Vec::new(),
            prs: Vec::new(),
            extra: Map::new(),
        }
    }
}

/// A repo without a `remote` is a plain folder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Alignment {
    pub asked_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recorded_at: Option<String>,
    pub questions: Vec<Question>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub aspect: String,
    pub question: String,
    pub options: Vec<Choice>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended: Option<String>,
    #[serde(default)]
    pub must_answer: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer: Option<Answer>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answered_by: Option<String>,
}

/// One option offered for a question.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consequence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Answer {
    /// The ids of the options the person picked.
    #[serde(rename = "option")]
    Chosen {
        options: Vec<String>,
    },
    Text {
        text: String,
    },
    /// The person let the agent decide.
    Agent {},
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub id: String,
    pub context: String,
    pub options: Vec<String>,
    pub decision: String,
    pub why: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revisit_when: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_question: Option<String>,
    pub at: String,
    pub by: String,
}

/// `by` and `at` say who last moved the todo, and when.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub text: String,
    pub state: TodoState,
    pub by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    pub at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TodoState {
    Open,
    Doing,
    Done,
    Dropped,
}

/// What the agent last reported. The app never fetches PR state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Pr {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repo: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(default)]
    pub todos: Vec<String>,
    pub state: PrState,
    pub checks: Checks,
    pub review: Review,
    pub reported_at: String,
    pub by: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PrState {
    Open,
    Merged,
    Closed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Checks {
    Pending,
    Passing,
    Failing,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Review {
    Waiting,
    ChangesRequested,
    Approved,
}

pub fn work_path(doc_path: &Path) -> Result<PathBuf, String> {
    sidecar_path(doc_path, WORK_SUFFIX)
}

/// `None` means no work has been recorded for this plan yet.
pub fn read(doc_path: &Path) -> Result<Option<WorkRecord>, String> {
    let contents = match std::fs::read_to_string(work_path(doc_path)?) {
        Ok(contents) => contents,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(friendly_read_error(&e)),
    };
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|e| format!("This plan's work record can't be read: {e}"))
}

pub fn write(doc_path: &Path, record: &WorkRecord) -> Result<(), String> {
    let json = serde_json::to_string_pretty(record).map_err(|e| e.to_string())?;
    atomic_write(&work_path(doc_path)?, &format!("{json}\n"))
}

/// Reads, applies `change` and writes back while holding the record's lock,
/// so two sessions on one plan never lose each other's write. An error from
/// `change` leaves the file as it was.
pub fn modify(
    doc_path: &Path,
    change: impl FnOnce(&mut WorkRecord) -> Result<(), String>,
) -> Result<WorkRecord, String> {
    let _lock = Lock::acquire(sidecar_path(doc_path, LOCK_SUFFIX)?)?;
    let mut record = read(doc_path)?.unwrap_or_default();
    change(&mut record)?;
    write(doc_path, &record)?;
    Ok(record)
}

/// Appends one open todo per text, numbered after the highest existing id.
pub fn add_todos(
    record: &mut WorkRecord,
    texts: &[String],
    by: &str,
    session: Option<&str>,
) -> Vec<Todo> {
    let first = next_number(record.todos.iter().map(|t| t.id.as_str()), "t");
    let at = now_iso();
    let added: Vec<Todo> = texts
        .iter()
        .zip(first..)
        .map(|(text, n)| Todo {
            id: format!("t{n}"),
            text: text.clone(),
            state: TodoState::Open,
            by: by.to_string(),
            session: session.map(str::to_string),
            at: at.clone(),
            reason: None,
        })
        .collect();
    record.todos.extend(added.iter().cloned());
    added
}

/// A dropped todo needs a reason.
pub fn update_todo(
    record: &mut WorkRecord,
    id: &str,
    state: TodoState,
    reason: Option<String>,
    by: &str,
) -> Result<Todo, String> {
    if state == TodoState::Dropped && reason.is_none() {
        return Err(format!("Say why todo {id} is dropped."));
    }
    let todo = record
        .todos
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("This plan has no todo {id}."))?;
    todo.state = state;
    todo.reason = reason;
    todo.by = by.to_string();
    todo.at = now_iso();
    Ok(todo.clone())
}

/// Records the questions as answered. Refused, with the ids of the questions
/// that have no answer, unless every one has an answer.
pub fn record_alignment(
    record: &mut WorkRecord,
    questions: Vec<Question>,
) -> Result<(), Vec<String>> {
    let unanswered: Vec<String> = questions
        .iter()
        .filter(|q| q.answer.is_none())
        .map(|q| q.id.clone())
        .collect();
    if !unanswered.is_empty() {
        return Err(unanswered);
    }
    let now = now_iso();
    let asked_at = record.alignment.take().map_or(now.clone(), |a| a.asked_at);
    record.alignment = Some(Alignment {
        asked_at,
        recorded_at: Some(now),
        questions,
    });
    Ok(())
}

/// An alignment with no questions was never really asked.
pub fn is_aligned(record: &WorkRecord) -> bool {
    record.alignment.as_ref().is_some_and(|a| {
        a.recorded_at.is_some()
            && !a.questions.is_empty()
            && a.questions.iter().all(|q| q.answer.is_some())
    })
}

/// Todos still open or in hand.
pub fn open_todos(record: &WorkRecord) -> usize {
    record
        .todos
        .iter()
        .filter(|t| matches!(t.state, TodoState::Open | TodoState::Doing))
        .count()
}

/// False when no PR is recorded: there is nothing to have merged.
pub fn all_prs_merged(record: &WorkRecord) -> bool {
    !record.prs.is_empty() && record.prs.iter().all(|p| p.state == PrState::Merged)
}

/// A PR reported again under the same url replaces its earlier entry.
pub fn record_pr(record: &mut WorkRecord, pr: Pr) {
    let pr = Pr {
        reported_at: now_iso(),
        ..pr
    };
    match record.prs.iter_mut().find(|p| p.url == pr.url) {
        Some(existing) => *existing = pr,
        None => record.prs.push(pr),
    }
}

/// Numbers the decisions after the highest existing id and stamps them.
pub fn add_decisions(record: &mut WorkRecord, decisions: Vec<Decision>) -> Vec<Decision> {
    let first = next_number(record.decisions.iter().map(|d| d.id.as_str()), "D");
    let at = now_iso();
    let added: Vec<Decision> = decisions
        .into_iter()
        .zip(first..)
        .map(|(d, n)| Decision {
            id: format!("D{n}"),
            at: at.clone(),
            ..d
        })
        .collect();
    record.decisions.extend(added.iter().cloned());
    added
}

pub fn set_repos(record: &mut WorkRecord, repos: Vec<Repo>) {
    record.repos = repos;
}

/// Done todos out of all todos. Dropped ones count as neither.
pub fn progress(record: &WorkRecord) -> (usize, usize) {
    let counted = record
        .todos
        .iter()
        .filter(|t| t.state != TodoState::Dropped);
    let done = counted
        .clone()
        .filter(|t| t.state == TodoState::Done)
        .count();
    (done, counted.count())
}

/// What the board shows of one plan's record on its card: todo progress,
/// the repos and how many PRs are merged.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PlanProgress {
    pub path: PathBuf,
    pub done: usize,
    pub total: usize,
    pub repos: Vec<Repo>,
    pub prs: PrSummary,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PrSummary {
    pub total: usize,
    pub merged: usize,
}

/// Progress for each plan that has a record. A plan without one, or with one
/// that cannot be read, is left out.
pub fn progress_of(doc_paths: &[PathBuf]) -> Vec<PlanProgress> {
    doc_paths
        .iter()
        .filter_map(|path| {
            let record = read(path).ok()??;
            let (done, total) = progress(&record);
            let merged = record
                .prs
                .iter()
                .filter(|pr| pr.state == PrState::Merged)
                .count();
            Some(PlanProgress {
                path: path.clone(),
                done,
                total,
                prs: PrSummary {
                    total: record.prs.len(),
                    merged,
                },
                repos: record.repos,
            })
        })
        .collect()
}

/// Copies a plan's legacy frontmatter `pr` into the record, once.
pub fn absorb_pr(record: &mut WorkRecord, url: &str) {
    if record.prs.iter().any(|p| p.url == url) {
        return;
    }
    record_pr(
        record,
        Pr {
            url: url.to_string(),
            repo: None,
            branch: None,
            todos: Vec::new(),
            state: PrState::Open,
            checks: Checks::Pending,
            review: Review::Waiting,
            reported_at: String::new(),
            by: "import".to_string(),
        },
    );
}

/// One more than the highest `<prefix><number>` id, so an id is never reused
/// after its item is removed.
fn next_number<'a>(ids: impl Iterator<Item = &'a str>, prefix: &str) -> usize {
    ids.filter_map(|id| id.strip_prefix(prefix)?.parse::<usize>().ok())
        .max()
        .unwrap_or(0)
        + 1
}

/// A lock file beside the record, held for one read-modify-write. Dropping it
/// removes the file, so a failed change or a panic still releases it.
struct Lock(PathBuf);

impl Lock {
    fn acquire(path: PathBuf) -> Result<Lock, String> {
        let started = Instant::now();
        loop {
            let created = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path);
            match created {
                Ok(_) => return Ok(Lock(path)),
                Err(e) if e.kind() != std::io::ErrorKind::AlreadyExists => {
                    return Err(friendly_write_error(&e))
                }
                Err(_) if is_stale(&path) => {
                    let _ = std::fs::remove_file(&path);
                }
                Err(_) if started.elapsed() > LOCK_TIMEOUT => {
                    return Err(
                        "Another session is still saving this plan's work. Try again in a moment."
                            .to_string(),
                    )
                }
                Err(_) => std::thread::sleep(LOCK_RETRY),
            }
        }
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn is_stale(path: &Path) -> bool {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .is_some_and(|age| age > STALE_LOCK)
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

    fn texts(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    fn question(id: &str, answer: Option<Answer>) -> Question {
        Question {
            id: id.to_string(),
            aspect: "tests".to_string(),
            question: "Which tests?".to_string(),
            options: vec![Choice {
                id: "a".to_string(),
                label: "Unit tests".to_string(),
                consequence: None,
            }],
            recommended: Some("a".to_string()),
            must_answer: false,
            answer,
            answered_by: Some("user".to_string()),
        }
    }

    fn asked_but_not_recorded() -> WorkRecord {
        WorkRecord {
            alignment: Some(Alignment {
                asked_at: "x".to_string(),
                recorded_at: None,
                questions: vec![question("q1", Some(Answer::Agent {}))],
            }),
            ..WorkRecord::default()
        }
    }

    fn pr(url: &str, state: PrState) -> Pr {
        Pr {
            url: url.to_string(),
            repo: None,
            branch: None,
            todos: Vec::new(),
            state,
            checks: Checks::Passing,
            review: Review::Approved,
            reported_at: "2026-10-28T00:00:00Z".to_string(),
            by: "claude-code".to_string(),
        }
    }

    #[test]
    fn reports_no_record_as_absent() {
        let dir = temp_dir("openplan-core-work-absent");

        assert_eq!(read(&dir.join("plan.md")).unwrap(), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn round_trips_and_keeps_fields_it_does_not_know() {
        let dir = temp_dir("openplan-core-work-roundtrip");
        let doc = dir.join("plan.md");
        std::fs::write(
            dir.join(".plan.md.oplan-work.json"),
            r#"{"version":1,"todos":[{"id":"t1","text":"Write it","state":"open","by":"claude-code","at":"2026-10-28T00:00:00Z"}],"futureField":{"a":1}}"#,
        )
        .unwrap();

        let record = modify(&doc, |r| {
            add_todos(r, &texts(&["Test it"]), "codex", None);
            Ok(())
        })
        .unwrap();

        let again = read(&doc).unwrap().unwrap();
        assert_eq!(again, record);
        assert_eq!(again.todos.len(), 2);
        assert_eq!(
            again.extra.get("futureField"),
            Some(&serde_json::json!({"a": 1}))
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn writes_the_wire_names_the_app_reads() {
        let mut record = asked_but_not_recorded();
        record_pr(
            &mut record,
            Pr {
                review: Review::ChangesRequested,
                ..pr("u", PrState::Open)
            },
        );

        let json = serde_json::to_value(&record).unwrap();

        assert_eq!(
            json["alignment"]["questions"][0]["answer"],
            serde_json::json!({"kind": "agent"})
        );
        assert_eq!(json["alignment"]["questions"][0]["mustAnswer"], false);
        assert_eq!(json["prs"][0]["review"], "changes-requested");
        assert!(json["prs"][0]["reportedAt"].is_string());
    }

    #[test]
    fn reads_a_picked_option_answer() {
        let answer: Answer = serde_json::from_str(r#"{"kind":"option","options":["a"]}"#).unwrap();

        assert_eq!(
            answer,
            Answer::Chosen {
                options: vec!["a".to_string()]
            }
        );
    }

    #[test]
    fn explains_a_record_that_is_not_valid_json() {
        let dir = temp_dir("openplan-core-work-invalid");
        let doc = dir.join("plan.md");
        std::fs::write(work_path(&doc).unwrap(), "{not json").unwrap();

        let err = read(&doc).unwrap_err();

        assert!(err.contains("work record"), "got: {err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn todo_ids_continue_from_the_highest_existing() {
        let mut record = WorkRecord::default();
        add_todos(&mut record, &texts(&["a", "b"]), "claude-code", Some("s1"));
        record.todos.remove(0);

        let added = add_todos(&mut record, &texts(&["c", "d"]), "codex", None);

        let ids: Vec<_> = added.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["t3", "t4"]);
        assert_eq!(added[0].state, TodoState::Open);
        assert_eq!(added[0].by, "codex");
        assert_eq!(record.todos.len(), 3);
    }

    #[test]
    fn updating_a_todo_moves_it_and_says_who() {
        let mut record = WorkRecord::default();
        add_todos(&mut record, &texts(&["a"]), "claude-code", None);

        let todo = update_todo(&mut record, "t1", TodoState::Done, None, "codex").unwrap();

        assert_eq!(todo.state, TodoState::Done);
        assert_eq!(record.todos[0].by, "codex");
        assert!(update_todo(&mut record, "t9", TodoState::Done, None, "codex").is_err());
        assert!(update_todo(&mut record, "t1", TodoState::Dropped, None, "codex").is_err());
        assert!(update_todo(
            &mut record,
            "t1",
            TodoState::Dropped,
            Some("Not needed".into()),
            "codex"
        )
        .is_ok());
    }

    #[test]
    fn alignment_is_refused_while_a_question_has_no_answer() {
        let mut record = WorkRecord::default();

        let refused = record_alignment(
            &mut record,
            vec![question("q1", Some(Answer::Agent {})), question("q2", None)],
        );

        assert_eq!(refused, Err(vec!["q2".to_string()]));
        assert_eq!(record.alignment, None);
        assert!(!is_aligned(&record));
    }

    #[test]
    fn a_recorded_alignment_with_every_answer_is_aligned() {
        let mut record = WorkRecord::default();
        assert!(!is_aligned(&record));

        record_alignment(
            &mut record,
            vec![
                question(
                    "q1",
                    Some(Answer::Chosen {
                        options: vec!["a".to_string()],
                    }),
                ),
                question(
                    "q2",
                    Some(Answer::Text {
                        text: "Only unit".to_string(),
                    }),
                ),
            ],
        )
        .unwrap();

        assert!(is_aligned(&record));
        assert!(record.alignment.as_ref().unwrap().recorded_at.is_some());
    }

    #[test]
    fn asked_alignment_is_not_aligned_until_recorded() {
        let record = asked_but_not_recorded();

        assert!(!is_aligned(&record));
    }

    #[test]
    fn counts_open_and_doing_todos_as_open() {
        let mut record = WorkRecord::default();
        add_todos(
            &mut record,
            &texts(&["a", "b", "c", "d"]),
            "claude-code",
            None,
        );
        update_todo(&mut record, "t2", TodoState::Doing, None, "claude-code").unwrap();
        update_todo(&mut record, "t3", TodoState::Done, None, "claude-code").unwrap();
        update_todo(
            &mut record,
            "t4",
            TodoState::Dropped,
            Some("x".into()),
            "claude-code",
        )
        .unwrap();

        assert_eq!(open_todos(&record), 2);
    }

    #[test]
    fn prs_are_all_merged_only_when_there_are_some() {
        let mut record = WorkRecord::default();
        assert!(!all_prs_merged(&record));

        record_pr(&mut record, pr("https://x/pull/1", PrState::Merged));
        assert!(all_prs_merged(&record));

        record_pr(&mut record, pr("https://x/pull/2", PrState::Open));
        assert!(!all_prs_merged(&record));
    }

    #[test]
    fn reporting_a_pr_again_replaces_it_by_url() {
        let mut record = WorkRecord::default();
        record_pr(&mut record, pr("https://x/pull/1", PrState::Open));
        record_pr(&mut record, pr("https://x/pull/2", PrState::Open));

        record_pr(&mut record, pr("https://x/pull/1", PrState::Merged));

        assert_eq!(record.prs.len(), 2);
        assert_eq!(record.prs[0].url, "https://x/pull/1");
        assert_eq!(record.prs[0].state, PrState::Merged);
    }

    #[test]
    fn absorbing_a_legacy_pr_happens_once() {
        let mut record = WorkRecord::default();

        absorb_pr(&mut record, "https://x/pull/4");
        absorb_pr(&mut record, "https://x/pull/4");

        assert_eq!(record.prs.len(), 1);
        let pr = &record.prs[0];
        assert_eq!(
            (pr.state, pr.checks, pr.review, pr.by.as_str()),
            (PrState::Open, Checks::Pending, Review::Waiting, "import")
        );
    }

    #[test]
    fn absorbing_leaves_a_pr_the_agent_already_reported() {
        let mut record = WorkRecord::default();
        record_pr(&mut record, pr("https://x/pull/4", PrState::Merged));

        absorb_pr(&mut record, "https://x/pull/4");

        assert_eq!(record.prs.len(), 1);
        assert_eq!(record.prs[0].state, PrState::Merged);
    }

    #[test]
    fn decision_ids_continue_from_the_highest_existing() {
        let mut record = WorkRecord::default();
        let decision = Decision {
            id: String::new(),
            context: "c".to_string(),
            options: texts(&["a", "b"]),
            decision: "a".to_string(),
            why: "w".to_string(),
            revisit_when: None,
            from_question: Some("q1".to_string()),
            at: String::new(),
            by: "claude-code".to_string(),
        };
        add_decisions(&mut record, vec![decision.clone()]);

        let added = add_decisions(&mut record, vec![decision.clone(), decision]);

        let ids: Vec<_> = added.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(ids, ["D2", "D3"]);
        assert!(!added[0].at.is_empty());
    }

    #[test]
    fn setting_repos_replaces_them() {
        let mut record = WorkRecord::default();
        let repo = |path: &str| Repo {
            path: path.to_string(),
            remote: None,
            branch: None,
        };
        set_repos(&mut record, vec![repo("a")]);

        set_repos(&mut record, vec![repo("b")]);

        assert_eq!(record.repos, vec![repo("b")]);
    }

    #[test]
    fn progress_counts_done_out_of_everything_not_dropped() {
        let mut record = WorkRecord::default();
        assert_eq!(progress(&record), (0, 0));
        add_todos(
            &mut record,
            &texts(&["a", "b", "c", "d"]),
            "claude-code",
            None,
        );
        update_todo(&mut record, "t1", TodoState::Done, None, "claude-code").unwrap();
        update_todo(&mut record, "t2", TodoState::Doing, None, "claude-code").unwrap();
        update_todo(
            &mut record,
            "t3",
            TodoState::Dropped,
            Some("x".into()),
            "claude-code",
        )
        .unwrap();

        assert_eq!(progress(&record), (1, 3));
    }

    #[test]
    fn a_failed_change_leaves_the_record_untouched() {
        let dir = temp_dir("openplan-core-work-failed-change");
        let doc = dir.join("plan.md");

        let err = modify(&doc, |r| {
            add_todos(r, &texts(&["a"]), "claude-code", None);
            Err("no".to_string())
        })
        .unwrap_err();

        assert_eq!(err, "no");
        assert_eq!(read(&doc).unwrap(), None);
        assert!(!dir.join(".plan.md.oplan-work.json.lock").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_lock_left_by_a_dead_process_is_cleared() {
        let dir = temp_dir("openplan-core-work-stale-lock");
        let doc = dir.join("plan.md");
        let lock = std::fs::File::create(dir.join(".plan.md.oplan-work.json.lock")).unwrap();
        lock.set_modified(std::time::SystemTime::now() - STALE_LOCK * 2)
            .unwrap();

        modify(&doc, |r| {
            add_todos(r, &texts(&["a"]), "claude-code", None);
            Ok(())
        })
        .unwrap();

        assert_eq!(read(&doc).unwrap().unwrap().todos.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn concurrent_writers_do_not_lose_each_others_todos() {
        let dir = temp_dir("openplan-core-work-concurrent");
        let doc = dir.join("plan.md");

        let writers: Vec<_> = ["claude-code", "codex"]
            .into_iter()
            .map(|by| {
                let doc = doc.clone();
                std::thread::spawn(move || {
                    for _ in 0..50 {
                        modify(&doc, |r| {
                            add_todos(r, &["x".to_string()], by, None);
                            Ok(())
                        })
                        .unwrap();
                    }
                })
            })
            .collect();
        for writer in writers {
            writer.join().unwrap();
        }

        let record = read(&doc).unwrap().unwrap();
        assert_eq!(record.todos.len(), 100);
        assert_eq!(record.todos.last().unwrap().id, "t100");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn progress_is_listed_for_each_plan_with_a_readable_record() {
        let dir = temp_dir("openplan-core-work-progress-list");
        let worked = dir.join("worked.md");
        let untouched = dir.join("untouched.md");
        let broken = dir.join("broken.md");
        let repo = Repo {
            path: "~/Personal/openplan".to_string(),
            remote: Some("github.com/owner/openplan".to_string()),
            branch: Some("feat/cards".to_string()),
        };
        modify(&worked, |r| {
            add_todos(r, &texts(&["a", "b"]), "claude-code", None);
            set_repos(r, vec![repo.clone()]);
            record_pr(r, pr("https://github.com/owner/openplan/pull/1", PrState::Merged));
            record_pr(r, pr("https://github.com/owner/openplan/pull/2", PrState::Open));
            update_todo(r, "t1", TodoState::Done, None, "claude-code").map(|_| ())
        })
        .unwrap();
        std::fs::write(work_path(&broken).unwrap(), "not json").unwrap();

        let listed = progress_of(&[worked.clone(), untouched, broken]);

        assert_eq!(
            listed,
            vec![PlanProgress {
                path: worked,
                done: 1,
                total: 2,
                repos: vec![repo],
                prs: PrSummary { total: 2, merged: 1 },
            }]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
