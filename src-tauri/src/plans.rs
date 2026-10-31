//! The commands the app calls to work with the plan base. Everything of
//! substance lives in openplan-core, which the CLI links too; these are the
//! thin edge that turns it into something the interface can call.

use openplan_core::base::Base;
use openplan_core::plan::folder_list;
use openplan_core::{bulk, comments, library, plan, repo, settings, standards, work};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use tauri::Emitter;

/// The base, resolved once in setup and handed to every command that needs
/// it. Resolving it commits the base, so commands that resolved it for
/// themselves raced on git's index lock at first paint.
pub struct BaseState(Result<Base, String>);

impl BaseState {
    pub fn new(base: Result<Base, String>) -> BaseState {
        BaseState(base)
    }

    pub fn get(&self) -> Result<&Base, String> {
        self.0.as_ref().map_err(String::clone)
    }
}

fn relative<'a>(base: &Base, path: &'a Path) -> Result<&'a Path, String> {
    path.strip_prefix(&base.root)
        .map_err(|_| "That plan isn't in the plan base.".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummary {
    id: String,
    title: String,
    status: plan::Status,
    #[serde(rename = "type")]
    plan_type: Option<String>,
    source: String,
    folders: Vec<String>,
    pr: Option<String>,
    created: Option<String>,
    updated: Option<String>,
    completed: Option<String>,
    demo: bool,
    path: PathBuf,
    relative_path: PathBuf,
    documents: Vec<PathBuf>,
}

impl From<library::PlanEntry> for PlanSummary {
    fn from(entry: library::PlanEntry) -> Self {
        PlanSummary {
            id: entry.meta.id,
            title: entry.meta.title,
            status: entry.meta.status,
            plan_type: entry.meta.plan_type,
            source: entry.meta.source,
            folders: entry.meta.folders,
            pr: entry.meta.pr,
            created: entry.meta.created,
            updated: entry.meta.updated,
            completed: entry.meta.completed,
            demo: entry.meta.demo,
            path: entry.path,
            relative_path: entry.relative_path,
            documents: entry.documents,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseInfo {
    root: PathBuf,
}

#[tauri::command]
pub async fn get_base(state: tauri::State<'_, BaseState>) -> Result<BaseInfo, String> {
    Ok(BaseInfo {
        root: state.get()?.root.clone(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Standards {
    /// What ships with the app, shown so it is clear what is being added to.
    built_in: String,
    /// What this person added, if anything.
    overrides: Option<String>,
}

#[tauri::command]
pub async fn get_standards() -> Result<Standards, String> {
    let saved = settings::read_settings(&settings::settings_path()?)?;
    Ok(Standards {
        built_in: standards::BUILT_IN.to_string(),
        overrides: saved.and_then(|s| s.standards),
    })
}

/// Which format agents write plan bodies in.
#[tauri::command]
pub async fn get_authoring() -> Result<String, String> {
    let saved = settings::read_settings(&settings::settings_path()?)?;
    Ok(settings::authoring_mode(saved.and_then(|s| s.authoring).as_deref()).to_string())
}

/// Takes effect on the next plan an agent files.
#[tauri::command]
pub async fn set_authoring(
    mode: String,
    state: tauri::State<'_, BaseState>,
) -> Result<(), String> {
    let path = settings::settings_path()?;
    let mut saved = settings::read_settings(&path)?.unwrap_or_default();
    if saved.base_path.as_os_str().is_empty() {
        saved.base_path = state.get()?.root.clone();
    }
    saved.authoring = Some(settings::authoring_mode(Some(&mode)).to_string());
    settings::write_settings(&path, &saved)
}

/// Agents are told the built-in standards with these layered on top.
#[tauri::command]
pub async fn set_standards_overrides(
    text: String,
    state: tauri::State<'_, BaseState>,
) -> Result<(), String> {
    let path = settings::settings_path()?;
    let mut saved = settings::read_settings(&path)?.unwrap_or_default();
    if saved.base_path.as_os_str().is_empty() {
        saved.base_path = state.get()?.root.clone();
    }
    let trimmed = text.trim();
    saved.standards = (!trimmed.is_empty()).then(|| trimmed.to_string());
    settings::write_settings(&path, &saved)
}

#[tauri::command]
pub async fn scan_plans(state: tauri::State<'_, BaseState>) -> Result<Vec<PlanSummary>, String> {
    Ok(library::scan(state.get()?)
        .into_iter()
        .map(Into::into)
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    path: PathBuf,
    title: String,
    line: usize,
    text: String,
}

#[tauri::command]
pub async fn search_plans(
    query: String,
    state: tauri::State<'_, BaseState>,
) -> Result<Vec<SearchHit>, String> {
    Ok(library::search(state.get()?, &query)
        .into_iter()
        .map(|hit| SearchHit {
            path: hit.path,
            title: hit.title,
            line: hit.line,
            text: hit.text,
        })
        .collect())
}

/// Rewrites only the plan's status, leaving its body untouched. The person
/// can set any status, completed and archived included; agents cannot.
#[tauri::command]
pub async fn set_plan_status(
    path: String,
    status: plan::Status,
    state: tauri::State<'_, BaseState>,
) -> Result<(), String> {
    let now = openplan_core::import::now_iso();
    let id = rewrite_meta(Path::new(&path), |meta| meta.set_status(status, &now))?;
    let _ = repo::commit_all(
        &state.get()?.root,
        &settings::me(),
        &format!("{}: {id}", status.as_str()),
    );
    Ok(())
}

/// One status for several plans, recorded as one change by the person.
#[tauri::command]
pub async fn set_statuses(
    paths: Vec<PathBuf>,
    status: plan::Status,
    state: tauri::State<'_, BaseState>,
) -> Result<(), String> {
    let now = openplan_core::import::now_iso();
    bulk::set_statuses(state.get()?, &settings::me(), &paths, status, &now)
}

/// The person deletes plans from the app. Agents have no way to do this:
/// the MCP server never calls it.
#[tauri::command]
pub async fn delete_plans(
    paths: Vec<PathBuf>,
    state: tauri::State<'_, BaseState>,
) -> Result<(), String> {
    bulk::delete_plans(state.get()?, &settings::me(), &paths)
}

/// The folders a plan is filed under. Only the person sets them, so this
/// is the one writer.
#[tauri::command]
pub async fn set_folders(
    path: String,
    folders: Vec<String>,
    state: tauri::State<'_, BaseState>,
) -> Result<(), String> {
    let id = rewrite_meta(Path::new(&path), |meta| meta.folders = folder_list(folders))?;
    let _ = repo::commit_all(&state.get()?.root, &settings::me(), &format!("edit: {id}"));
    Ok(())
}

/// The folders the person made, including ones no plan is in yet.
#[tauri::command]
pub async fn base_folders(state: tauri::State<'_, BaseState>) -> Result<Vec<String>, String> {
    openplan_core::base::base_folders(state.get()?)
}

/// Replaces the folders the person made. Plans keep the folders in their own
/// frontmatter, so a removed folder that a plan is in still shows.
#[tauri::command]
pub async fn set_base_folders(
    folders: Vec<String>,
    state: tauri::State<'_, BaseState>,
) -> Result<Vec<String>, String> {
    let base = state.get()?;
    let saved = openplan_core::base::set_base_folders(base, folders)?;
    let _ = repo::commit_all(&base.root, &settings::me(), "edit: folders");
    Ok(saved)
}

/// Records whatever is currently in the base. Called after the app saves, and
/// after an outside change lands, so nothing sits uncommitted for long.
#[tauri::command]
pub async fn commit_base(
    message: String,
    state: tauri::State<'_, BaseState>,
) -> Result<Option<String>, String> {
    repo::commit_all(&state.get()?.root, &settings::me(), &message)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    origin: char,
    text: String,
    old_line: Option<u32>,
    new_line: Option<u32>,
}

#[tauri::command]
pub async fn plan_diff(
    path: String,
    revision: String,
    state: tauri::State<'_, BaseState>,
) -> Result<Vec<DiffLine>, String> {
    let base = state.get()?;
    let path = PathBuf::from(&path);
    Ok(repo::diff_since(&base.root, relative(base, &path)?, &revision)?
        .into_iter()
        .map(|l| DiffLine {
            origin: l.origin,
            text: l.text,
            old_line: l.old_line,
            new_line: l.new_line,
        })
        .collect())
}

#[tauri::command]
pub async fn rename_plan(
    path: String,
    new_title: String,
    state: tauri::State<'_, BaseState>,
) -> Result<PathBuf, String> {
    openplan_core::import::rename_plan(
        state.get()?,
        &openplan_core::settings::me(),
        std::path::Path::new(&path),
        &new_title,
    )
}

#[tauri::command]
pub async fn rename_document(
    path: String,
    new_name: String,
    state: tauri::State<'_, BaseState>,
) -> Result<PathBuf, String> {
    openplan_core::import::rename_document(
        state.get()?,
        &openplan_core::settings::me(),
        std::path::Path::new(&path),
        &new_name,
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityInfo {
    name: String,
    email: String,
    /// The picture's absolute path, or null for the generated marble.
    avatar: Option<PathBuf>,
}

/// Who this machine's changes and comments belong to, so the interface can
/// say "You" for your own and name everyone else.
#[tauri::command]
pub async fn app_identity() -> Result<IdentityInfo, String> {
    Ok(identity_info(settings::current_identity(), settings::current_avatar()))
}

/// A blank name or email falls back to the git config.
#[tauri::command]
pub async fn set_profile(name: Option<String>, email: Option<String>) -> Result<IdentityInfo, String> {
    let mut refused = Ok(());
    crate::onboarding::update_settings(|s| refused = settings::apply_profile(s, name, email))?;
    refused?;
    app_identity().await
}

/// Copies the chosen picture beside the settings file.
#[tauri::command]
pub async fn set_avatar(path: PathBuf) -> Result<IdentityInfo, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
        .to_string();
    let saved = settings::save_avatar(&settings::settings_dir()?, &path, &stamp)?;
    crate::onboarding::update_settings(|s| s.avatar = Some(saved))?;
    app_identity().await
}

#[tauri::command]
pub async fn clear_avatar() -> Result<IdentityInfo, String> {
    settings::remove_avatars(&settings::settings_dir()?)?;
    crate::onboarding::update_settings(|s| s.avatar = None)?;
    app_identity().await
}

fn identity_info(id: repo::Identity, avatar: Option<PathBuf>) -> IdentityInfo {
    IdentityInfo {
        name: id.name,
        email: id.email,
        avatar,
    }
}

#[tauri::command]
pub async fn comment_threads(path: String) -> Result<Vec<comments::CommentThread>, String> {
    Ok(comments::read_threads(std::path::Path::new(&path)))
}

/// The interface writes whole thread lists. The write always happens first,
/// so typed text is on disk before anything else can fail. `commit` is false
/// while a review is still being put together: those threads are recorded
/// with the review that carries them, under its own message.
#[tauri::command]
pub async fn save_comment_threads(
    path: String,
    threads: Vec<comments::CommentThread>,
    commit: bool,
    state: tauri::State<'_, BaseState>,
) -> Result<(), String> {
    let before = comments::read_threads(Path::new(&path));
    comments::write_threads(Path::new(&path), &threads)?;
    if let (true, Ok(base)) = (crate::review::sends_a_review(&before, &threads), state.get()) {
        // The review is on disk either way, and a plan left in draft is the
        // person's to move.
        let _ = align_draft(base, Path::new(&path));
    }
    if !commit {
        return Ok(());
    }
    let name = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("plan")
        .to_string();
    let _ = repo::commit_all(
        &state.get()?.root,
        &settings::me(),
        &format!("comments: {name}"),
    );
    Ok(())
}

/// The person answers questions an agent posted, from the plan page, and
/// gets the record back as written.
#[tauri::command]
pub async fn answer_questions(
    path: String,
    answers: Vec<work::GivenAnswer>,
    state: tauri::State<'_, BaseState>,
) -> Result<work::WorkRecord, String> {
    let path = Path::new(&path);
    let record = record_answers(path, answers, &settings::current_identity().name)?;
    let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("plan");
    let _ = repo::commit_all(&state.get()?.root, &settings::me(), &format!("answer: {name}"));
    Ok(record)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    id: String,
    author: String,
    timestamp: i64,
    message: String,
}

#[tauri::command]
pub async fn plan_history(
    path: String,
    state: tauri::State<'_, BaseState>,
) -> Result<Vec<Revision>, String> {
    let base = state.get()?;
    let path = PathBuf::from(&path);
    Ok(repo::history(&base.root, relative(base, &path)?)?
        .into_iter()
        .map(|r| Revision {
            id: r.id,
            author: r.author,
            timestamp: r.timestamp,
            message: r.message,
        })
        .collect())
}

#[tauri::command]
pub async fn plan_at_revision(
    path: String,
    revision: String,
    state: tauri::State<'_, BaseState>,
) -> Result<String, String> {
    let base = state.get()?;
    let path = PathBuf::from(&path);
    repo::read_at(&base.root, relative(base, &path)?, &revision)
}

/// Restores an earlier revision by writing it as the current text — the plan's
/// history keeps both, since going back is itself a change worth recording.
#[tauri::command]
pub async fn restore_plan_revision(
    path: String,
    revision: String,
    state: tauri::State<'_, BaseState>,
) -> Result<String, String> {
    let base = state.get()?;
    let path_buf = PathBuf::from(&path);
    let text = repo::read_at(&base.root, relative(base, &path_buf)?, &revision)?;
    openplan_core::fs::atomic_write(&path_buf, &text)?;
    let short: String = revision.chars().take(8).collect();
    let name = path_buf
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("plan")
        .to_string();
    let _ = repo::commit_all(
        &base.root,
        &settings::me(),
        &format!("restore: {name} to {short}"),
    );
    Ok(text)
}

/// Watches the base for changes made outside the app — an agent filing a plan,
/// or an editor saving one — records what arrived uncommitted, and tells the
/// interface to re-read. Events are coalesced so a burst of writes is one
/// refresh, and the watcher is OS-driven, so an idle base costs nothing.
pub fn watch_base(app: tauri::AppHandle, base: Option<Base>) {
    std::thread::spawn(move || {
        let Some(base) = base else { return };
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |event| {
            let _ = tx.send(event);
        }) {
            Ok(watcher) => watcher,
            Err(_) => return,
        };
        use notify::Watcher;
        if watcher
            .watch(&base.root, notify::RecursiveMode::Recursive)
            .is_err()
        {
            return;
        }

        let debounce = Duration::from_millis(300);
        loop {
            // Block until something happens, then drain whatever else arrives
            // in the same burst before telling anyone.
            let Ok(first) = rx.recv() else { return };
            let (mut content, mut plans) = touched(&base.root, &first);
            while let Ok(next) = rx.recv_timeout(debounce) {
                let (c, p) = touched(&base.root, &next);
                content |= c;
                plans |= p;
            }
            if plans {
                let _ = settings::sync_base(&base);
            }
            if content {
                let _ = app.emit("base-changed", ());
            }
        }
    });
}

/// What a watched path is: content the interface should re-read, and whether
/// it is a plan, which is what may need recording. Git's own bookkeeping
/// churns constantly and is neither. Judged from inside the base, since the
/// base itself is a dotted directory and every path under it would otherwise
/// look hidden. A sidecar is content but is never recorded here: a pending
/// comment thread is committed when its review is sent, and agents commit
/// their own work record writes.
fn touched(root: &Path, event: &notify::Result<notify::Event>) -> (bool, bool) {
    let Ok(event) = event else { return (false, false) };
    let mut content = false;
    let mut plans = false;
    for path in &event.paths {
        let Ok(inside) = path.strip_prefix(root) else {
            continue;
        };
        let sidecar =
            |name: &str| name.ends_with("oplan-comments.json") || name.ends_with("oplan-work.json");
        if inside.components().any(|c| {
            let name = c.as_os_str().to_str().unwrap_or("");
            name.starts_with('.') && !sidecar(name)
        }) {
            continue;
        }
        content = true;
        plans |= !sidecar(&path.to_string_lossy());
    }
    (content, plans)
}

pub fn setup(app: &tauri::App, base: Option<Base>) {
    watch_base(app.handle().clone(), base);
}

/// The first review sent on a draft opens alignment. `document` is the one
/// the threads are on, which in a set is not the file that holds the status.
fn align_draft(base: &Base, document: &Path) -> Result<(), String> {
    let entry = library::scan(base).into_iter().find(|entry| {
        entry.path == document
            || entry
                .path
                .parent()
                .is_some_and(|folder| !entry.documents.is_empty() && document.starts_with(folder))
    });
    let Some(entry) = entry.filter(|e| e.meta.status == plan::Status::Draft) else {
        return Ok(());
    };
    let now = openplan_core::import::now_iso();
    rewrite_meta(&entry.path, |meta| meta.set_status(plan::Status::Alignment, &now)).map(|_| ())
}

fn record_answers(path: &Path, answers: Vec<work::GivenAnswer>, by: &str) -> Result<work::WorkRecord, String> {
    work::modify(path, |record| work::answer_questions(record, answers, by))
}

/// Changes a plan's header and writes it back, returning the plan's id.
fn rewrite_meta(path: &Path, change: impl FnOnce(&mut plan::PlanMeta)) -> Result<String, String> {
    let text = openplan_core::fs::read_to_string(path)?;
    let mut parsed = plan::parse(&text, path);
    change(&mut parsed.meta);
    openplan_core::fs::atomic_write(path, &plan::serialize(&parsed))?;
    Ok(parsed.meta.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(path: PathBuf) -> notify::Result<notify::Event> {
        Ok(notify::Event {
            kind: notify::EventKind::Any,
            paths: vec![path],
            attrs: Default::default(),
        })
    }

    #[test]
    fn a_plan_written_outside_is_read_again_and_recorded() {
        let root = PathBuf::from("/base");

        assert_eq!(
            touched(&root, &event(root.join("plans").join("a.md"))),
            (true, true)
        );
    }

    #[test]
    fn a_comment_sidecar_is_read_again_but_not_recorded() {
        let root = PathBuf::from("/base");
        let sidecar = root.join("plans").join(".a.md.oplan-comments.json");

        assert_eq!(touched(&root, &event(sidecar)), (true, false));
    }

    #[test]
    fn a_work_record_is_read_again_but_not_recorded() {
        let root = PathBuf::from("/base");
        let record = root.join("plans").join(".a.md.oplan-work.json");

        assert_eq!(touched(&root, &event(record)), (true, false));
    }

    #[test]
    fn a_work_record_lock_is_neither() {
        let root = PathBuf::from("/base");
        let lock = root.join("plans").join(".a.md.oplan-work.json.lock");

        assert_eq!(touched(&root, &event(lock)), (false, false));
    }

    #[test]
    fn git_s_own_bookkeeping_is_neither() {
        let root = PathBuf::from("/base");

        assert_eq!(
            touched(&root, &event(root.join(".git").join("index"))),
            (false, false)
        );
    }

    fn a_plan_file(name: &str, text: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openplan-app-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("auth-refactor.md");
        std::fs::write(&path, text).unwrap();
        path
    }

    #[test]
    fn folder_names_are_cleaned_and_said_once() {
        let names = vec![
            " Search ".to_string(),
            "search".to_string(),
            "Q3, launch".to_string(),
            "  ".to_string(),
        ];

        assert_eq!(folder_list(names), ["Search", "Q3 launch"]);
    }

    #[test]
    fn setting_folders_rewrites_only_the_header() {
        let path = a_plan_file("folders", "---\ntitle: Auth refactor\nstatus: draft\n---\n# Body\n");

        let id = rewrite_meta(&path, |meta| meta.folders = folder_list(vec!["Infra".into()])).unwrap();

        let text = std::fs::read_to_string(&path).unwrap();
        assert_eq!(id, "auth-refactor");
        assert!(text.contains("folders: [Infra]\n"), "{text}");
        assert!(text.ends_with("---\n# Body\n"), "{text}");
    }

    #[test]
    fn completing_from_the_app_records_when() {
        let path = a_plan_file("complete", "---\ntitle: Auth refactor\nstatus: in-review\n---\n# Body\n");

        rewrite_meta(&path, |meta| meta.set_status(plan::Status::Completed, "2026-10-28T10:00:00Z"))
            .unwrap();

        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("status: completed\n"), "{text}");
        assert!(text.contains("completed: 2026-10-28T10:00:00Z\n"), "{text}");
    }

    #[test]
    fn the_first_review_on_a_draft_opens_alignment_and_later_ones_change_nothing() {
        let root = std::env::temp_dir().join(format!("openplan-app-first-review-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("plans")).unwrap();
        let base = Base { root: root.clone() };
        let draft = root.join("plans/auth-refactor.md");
        let started = root.join("plans/token-refresh.md");
        std::fs::write(&draft, "---\ntitle: Auth refactor\nstatus: draft\n---\n# Body\n").unwrap();
        std::fs::write(&started, "---\ntitle: Token refresh\nstatus: in-progress\n---\n# Body\n").unwrap();

        align_draft(&base, &draft).unwrap();
        align_draft(&base, &started).unwrap();
        align_draft(&base, &draft).unwrap();

        let status = |path: &Path| plan::parse(&std::fs::read_to_string(path).unwrap(), path).meta.status;
        assert_eq!(status(&draft), plan::Status::Alignment);
        assert_eq!(status(&started), plan::Status::InProgress);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_persons_answers_land_in_the_work_record_under_their_name() {
        let path = a_plan_file("answers", "---\ntitle: Auth refactor\nstatus: alignment\n---\n# Body\n");
        let posted: work::Question = serde_json::from_value(serde_json::json!({
            "id": "q1", "aspect": "scope", "question": "Which?", "options": [{ "id": "a", "label": "A" }]
        }))
        .unwrap();
        work::modify(&path, |r| work::ask_questions(r, vec![posted])).unwrap();
        let answers: Vec<work::GivenAnswer> =
            serde_json::from_value(serde_json::json!([{ "id": "q1", "answer": { "kind": "option", "options": ["a"] } }]))
                .unwrap();

        let record = record_answers(&path, answers, "Sid").unwrap();

        assert_eq!(work::read(&path).unwrap().unwrap(), record);
        let alignment = record.alignment.unwrap();
        assert_eq!(alignment.questions[0].answered_by.as_deref(), Some("Sid"));
        assert!(alignment.recorded_at.is_some());
    }

    #[test]
    fn an_identity_without_a_picture_says_so() {
        let id = repo::Identity {
            name: "Sid".into(),
            email: "sid@example.com".into(),
        };

        let json = serde_json::to_value(identity_info(id, None)).unwrap();

        assert_eq!(
            json,
            serde_json::json!({ "name": "Sid", "email": "sid@example.com", "avatar": null })
        );
    }

    #[test]
    fn a_plan_summary_says_whether_it_is_a_demo() {
        let path = PathBuf::from("/base/plans/demo-add-dark-mode.md");
        let entry = |text: &str| library::PlanEntry {
            meta: plan::parse(text, &path).meta,
            path: path.clone(),
            relative_path: PathBuf::from("plans/demo-add-dark-mode.md"),
            documents: Vec::new(),
        };

        let demo = serde_json::to_value(PlanSummary::from(entry("---\ndemo: true\n---\n# Demo\n"))).unwrap();
        let mine = serde_json::to_value(PlanSummary::from(entry("# Mine\n"))).unwrap();

        assert_eq!(demo["demo"], true);
        assert_eq!(mine["demo"], false);
    }

    #[test]
    fn a_path_outside_the_base_is_neither() {
        let root = PathBuf::from("/base");

        assert_eq!(
            touched(&root, &event(PathBuf::from("/elsewhere/a.md"))),
            (false, false)
        );
    }
}
