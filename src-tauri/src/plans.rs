//! The commands the app calls to work with the plan base. Everything of
//! substance lives in openplan-core, which the CLI links too; these are the
//! thin edge that turns it into something the interface can call.

use openplan_core::base::Base;
use openplan_core::{comments, library, plan, repo, settings, standards};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use tauri::Emitter;

fn base() -> Result<Base, String> {
    settings::resolve_default_base()
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
    project: Option<String>,
    pr: Option<String>,
    created: Option<String>,
    updated: Option<String>,
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
            project: entry.meta.project,
            pr: entry.meta.pr,
            created: entry.meta.created,
            updated: entry.meta.updated,
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
pub async fn get_base() -> Result<BaseInfo, String> {
    let base = base()?;
    Ok(BaseInfo {
        root: base.root,
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

/// Agents are told the built-in standards with these layered on top.
#[tauri::command]
pub async fn set_standards_overrides(text: String) -> Result<(), String> {
    let path = settings::settings_path()?;
    let mut saved = settings::read_settings(&path)?.unwrap_or_else(|| settings::Settings {
        base_path: Default::default(),
        standards: None,
        name: None,
        email: None,
        onboarded: false,
    });
    if saved.base_path.as_os_str().is_empty() {
        saved.base_path = base()?.root;
    }
    let trimmed = text.trim();
    saved.standards = (!trimmed.is_empty()).then(|| trimmed.to_string());
    settings::write_settings(&path, &saved)
}

#[tauri::command]
pub async fn scan_plans() -> Result<Vec<PlanSummary>, String> {
    Ok(library::scan(&base()?).into_iter().map(Into::into).collect())
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
pub async fn search_plans(query: String) -> Result<Vec<SearchHit>, String> {
    Ok(library::search(&base()?, &query)
        .into_iter()
        .map(|hit| SearchHit {
            path: hit.path,
            title: hit.title,
            line: hit.line,
            text: hit.text,
        })
        .collect())
}

/// Rewrites only the plan's status line, leaving its body untouched. The
/// person can set any status, completed included; agents cannot.
#[tauri::command]
pub async fn set_plan_status(path: String, status: plan::Status) -> Result<(), String> {
    let path = PathBuf::from(&path);
    let text = openplan_core::fs::read_to_string(&path)?;
    let mut parsed = plan::parse(&text, &path);
    parsed.meta.status = status;
    openplan_core::fs::atomic_write(&path, &plan::serialize(&parsed))?;

    let base = base()?;
    let _ = repo::commit_all(
        &base.root,
        &settings::me(),
        &format!("{}: {}", status.as_str(), parsed.meta.id),
    );
    Ok(())
}

/// Records whatever is currently in the base. Called after the app saves, and
/// after an outside change lands, so nothing sits uncommitted for long.
#[tauri::command]
pub async fn commit_base(message: String) -> Result<Option<String>, String> {
    let base = base()?;
    repo::commit_all(&base.root, &settings::me(), &message)
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
pub async fn plan_diff(path: String, revision: String) -> Result<Vec<DiffLine>, String> {
    let base = base()?;
    let path = PathBuf::from(&path);
    Ok(repo::diff_since(&base.root, relative(&base, &path)?, &revision)?
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
pub async fn rename_plan(path: String, new_title: String) -> Result<PathBuf, String> {
    let base = base()?;
    openplan_core::import::rename_plan(
        &base,
        &openplan_core::settings::me(),
        std::path::Path::new(&path),
        &new_title,
    )
}

#[tauri::command]
pub async fn rename_document(path: String, new_name: String) -> Result<PathBuf, String> {
    let base = base()?;
    openplan_core::import::rename_document(
        &base,
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
}

/// Who this machine's changes and comments belong to, so the interface can
/// say "You" for your own and name everyone else.
#[tauri::command]
pub async fn app_identity() -> Result<IdentityInfo, String> {
    let id = settings::current_identity();
    Ok(IdentityInfo {
        name: id.name,
        email: id.email,
    })
}

#[tauri::command]
pub async fn comment_threads(path: String) -> Result<Vec<comments::CommentThread>, String> {
    Ok(comments::read_threads(std::path::Path::new(&path)))
}

/// The interface writes whole thread lists; every save is one commit.
#[tauri::command]
pub async fn save_comment_threads(
    path: String,
    threads: Vec<comments::CommentThread>,
) -> Result<(), String> {
    comments::write_threads(std::path::Path::new(&path), &threads)?;
    let base = base()?;
    let name = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("plan")
        .to_string();
    let _ = repo::commit_all(&base.root, &settings::me(), &format!("comments: {name}"));
    Ok(())
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
pub async fn plan_history(path: String) -> Result<Vec<Revision>, String> {
    let base = base()?;
    let path = PathBuf::from(&path);
    Ok(repo::history(&base.root, relative(&base, &path)?)?
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
pub async fn plan_at_revision(path: String, revision: String) -> Result<String, String> {
    let base = base()?;
    let path = PathBuf::from(&path);
    repo::read_at(&base.root, relative(&base, &path)?, &revision)
}

/// Restores an earlier revision by writing it as the current text — the plan's
/// history keeps both, since going back is itself a change worth recording.
#[tauri::command]
pub async fn restore_plan_revision(path: String, revision: String) -> Result<String, String> {
    let base = base()?;
    let path_buf = PathBuf::from(&path);
    let text = repo::read_at(&base.root, relative(&base, &path_buf)?, &revision)?;
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
/// or an editor saving one — and tells the interface to re-read. Events are
/// coalesced so a burst of writes is one refresh, and the watcher is
/// OS-driven, so an idle base costs nothing.
pub fn watch_base(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let Ok(base) = base() else { return };
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
            let mut relevant = is_relevant(&base.root, &first);
            while let Ok(next) = rx.recv_timeout(debounce) {
                relevant |= is_relevant(&base.root, &next);
            }
            if relevant {
                let _ = app.emit("base-changed", ());
            }
        }
    });
}

/// Git's own bookkeeping and the comment sidecars churn constantly; only
/// changes to plans should send the interface back to disk. Judged from
/// inside the base, since the base itself is a dotted directory and every
/// path under it would otherwise look hidden.
fn is_relevant(root: &Path, event: &notify::Result<notify::Event>) -> bool {
    let Ok(event) = event else { return false };
    event.paths.iter().any(|path| {
        let Ok(inside) = path.strip_prefix(root) else {
            return false;
        };
        !inside.components().any(|c| {
            let name = c.as_os_str().to_str().unwrap_or("");
            // Comment sidecars are dotted but are content, not bookkeeping.
            name.starts_with('.') && !name.ends_with("oplan-comments.json")
        })
    })
}

pub fn setup(app: &tauri::App) {
    watch_base(app.handle().clone());
}
