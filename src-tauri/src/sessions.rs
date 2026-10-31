//! The loopback server while the app is open: who is working, on what, and
//! the way a review reaches them. The server itself lives in openplan-core so
//! the CLI's tests can run a real one; this is the edge that starts it, tells
//! the interface when something moved, and lets it send.

use openplan_core::base::Base;
use openplan_core::comments::CommentThread;
use openplan_core::library::PlanEntry;
use openplan_core::local::{self, AppInfo, CommentNote, Event, Notice, SessionInfo};
use openplan_core::{comments, library, repo, settings};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Emitter;

/// One per window, for the life of the window. Absent when the port could not
/// be bound, which leaves the app working and sessions simply unknown.
static SERVER: OnceLock<local::Server> = OnceLock::new();

/// Who is working right now, for the live marks on plans.
#[tauri::command]
pub async fn live_sessions() -> Vec<SessionInfo> {
    SERVER.get().map(|server| server.sessions()).unwrap_or_default()
}

/// Sends the named threads to every session working on that plan, and says how
/// many got them. Zero means nobody is working on it right now.
#[tauri::command]
pub async fn send_comments(
    path: String,
    thread_ids: Vec<String>,
    state: tauri::State<'_, crate::plans::BaseState>,
) -> Result<usize, String> {
    let Some(server) = SERVER.get() else {
        return Ok(0);
    };
    let path = PathBuf::from(&path);
    let plan = plan_of(state.get()?, &path)?;

    let notes = notes(&comments::read_threads(&path), &thread_ids);
    if notes.is_empty() {
        return Ok(0);
    }
    Ok(server.send(
        &plan.meta.id,
        Event::Comments {
            plan: plan.meta.id.clone(),
            threads: notes,
        },
    ))
}

/// Tells the sessions on the plan to start the work, with whatever review
/// comments were still unsent, and says how many heard. Zero means the next
/// session to take the plan hears it.
#[tauri::command]
pub async fn send_build(
    path: String,
    state: tauri::State<'_, crate::plans::BaseState>,
) -> Result<usize, String> {
    let base = state.get()?;
    let plan = plan_of(base, Path::new(&path))?;
    let threads = send_documents_unsent(base, &plan)?;
    Ok(send(
        &plan.meta.id,
        Event::Build {
            plan: plan.meta.id.clone(),
            threads,
        },
    ))
}

/// Tells the sessions on the plan the person answered its questions, and
/// says how many heard.
#[tauri::command]
pub async fn send_answers(plan: String) -> usize {
    send(&plan, Event::Answers { plan: plan.clone() })
}

/// Whether a send starts the agent's turn in an idle session.
pub fn set_wake(on: bool) {
    if let Some(server) = SERVER.get() {
        server.set_wake(on);
    }
}

fn send(plan_id: &str, event: Event) -> usize {
    SERVER.get().map(|server| server.send(plan_id, event)).unwrap_or(0)
}

/// The plan a document belongs to. A set keeps its threads on the document
/// they were written on, so that can be the folder's plan, not the file's.
fn plan_of(base: &Base, path: &Path) -> Result<PlanEntry, String> {
    library::scan(base)
        .into_iter()
        .find(|entry| {
            entry.path == path
                || entry
                    .path
                    .parent()
                    .is_some_and(|folder| !entry.documents.is_empty() && path.starts_with(folder))
        })
        .ok_or_else(|| "That plan isn't in the plan base.".to_string())
}

/// Sends every unsent thread on each of the plan's documents, and records
/// the review when there was one.
fn send_documents_unsent(base: &Base, plan: &PlanEntry) -> Result<Vec<CommentNote>, String> {
    let documents: Vec<PathBuf> = match plan.path.parent() {
        Some(folder) if !plan.documents.is_empty() => {
            plan.documents.iter().map(|d| folder.join(d)).collect()
        }
        _ => vec![plan.path.clone()],
    };
    let now = openplan_core::import::now_iso();
    let mut sent = Vec::new();
    for document in documents {
        let mut threads = comments::read_threads(&document);
        let notes = send_unsent(&mut threads, &now);
        if !notes.is_empty() {
            comments::write_threads(&document, &threads)?;
            sent.extend(notes);
        }
    }
    if !sent.is_empty() {
        let label = if sent.len() == 1 { "thread" } else { "threads" };
        let message = format!("review: {} ({} {label})", plan.meta.id, sent.len());
        let _ = repo::commit_all(&base.root, &settings::me(), &message);
    }
    Ok(sent)
}

/// Marks the threads the person was still writing as sent, and returns them
/// as they go out. A thread closed before it was sent was thrown away.
fn send_unsent(threads: &mut [CommentThread], now: &str) -> Vec<CommentNote> {
    let mut ids = Vec::new();
    for thread in threads.iter_mut().filter(|t| t.pending && !t.resolved) {
        thread.pending = false;
        thread.sent_at = Some(now.to_string());
        ids.push(thread.id.clone());
    }
    notes(threads, &ids)
}

/// The named threads, each as its newest comment: that is what is being sent,
/// and earlier replies are already in the plan's sidecar. A thread still
/// marked pending has not been sent, so naming it does not send it: the write
/// that clears `pending` is what makes it sendable.
fn notes(threads: &[CommentThread], wanted: &[String]) -> Vec<CommentNote> {
    wanted
        .iter()
        .filter_map(|id| threads.iter().find(|thread| &thread.id == id))
        .filter(|thread| !thread.pending)
        .filter_map(|thread| {
            let last = thread.comments.last()?;
            Some(CommentNote {
                id: thread.id.clone(),
                quote: thread.quote.clone(),
                line_start: thread.line_start,
                line_end: thread.line_end,
                text: last.text.clone(),
                author: last.label().to_string(),
            })
        })
        .collect()
}

/// A session tried to start its agent's turn, for the line after a send.
#[derive(Clone, Serialize)]
struct Woke {
    ok: bool,
    plans: Vec<String>,
}

pub fn setup(app: &tauri::App, base: Option<Base>) {
    if base.is_none() {
        return;
    }
    let handle = app.handle().clone();
    let Ok(server) = local::Server::start(move |notice| {
        let _ = match notice {
            Notice::SessionsChanged => handle.emit("sessions-changed", ()),
            Notice::Woke { ok, plans } => handle.emit("session-woke", Woke { ok, plans }),
        };
    }) else {
        return;
    };
    server.set_wake(settings::current_wake());
    if let Ok(path) = local::app_path() {
        let _ = local::write_app(
            &path,
            &AppInfo {
                port: server.port,
                pid: std::process::id(),
            },
        );
    }
    let _ = SERVER.set(server);
}

/// The server lives and dies with the window, so the file that advertises it
/// goes when the window does.
pub fn teardown() {
    if let Ok(path) = local::app_path() {
        local::remove_app(&path);
    }
    if let Some(server) = SERVER.get() {
        server.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use openplan_core::comments::CommentEntry;

    fn entry(author: &str, name: Option<&str>, text: &str) -> CommentEntry {
        CommentEntry {
            id: comments::new_id(),
            text: text.to_string(),
            created_at: "2026-09-22T10:00:00Z".to_string(),
            edited_at: None,
            author: author.to_string(),
            author_name: name.map(str::to_string),
            author_email: None,
        }
    }

    fn thread(id: &str, comments: Vec<CommentEntry>) -> CommentThread {
        CommentThread {
            id: id.to_string(),
            quote: "a line".to_string(),
            line_start: 4,
            line_end: 6,
            resolved: false,
            pending: false,
            resolved_by: None,
            resolved_at: None,
            sent_at: None,
            comments,
        }
    }

    #[test]
    fn only_the_threads_asked_for_are_sent_in_the_order_asked_for() {
        let threads = vec![
            thread("t1", vec![entry("user", Some("Sid"), "first")]),
            thread("t2", vec![entry("user", Some("Sid"), "second")]),
            thread("t3", vec![entry("user", Some("Sid"), "third")]),
        ];

        let sent = notes(&threads, &["t3".to_string(), "t1".to_string()]);

        assert_eq!(sent.len(), 2);
        assert_eq!(sent[0].id, "t3");
        assert_eq!(sent[1].id, "t1");
        assert_eq!(sent[0].line_start, 4);
        assert_eq!(sent[0].line_end, 6);
    }

    #[test]
    fn a_thread_is_sent_as_its_newest_comment_signed_by_whoever_wrote_it() {
        let threads = vec![thread(
            "t1",
            vec![
                entry("user", Some("Sid"), "explain this choice"),
                entry("claude-code", None, "Because the schema owns it."),
                entry("user", Some("Sid"), "Then say so in the plan."),
            ],
        )];

        let sent = notes(&threads, &["t1".to_string()]);

        assert_eq!(sent[0].text, "Then say so in the plan.");
        assert_eq!(sent[0].author, "Sid");
    }

    #[test]
    fn a_thread_still_being_written_is_not_sent_even_when_it_is_named() {
        let mut unsent = thread("t1", vec![entry("user", Some("Sid"), "half a thought")]);
        unsent.pending = true;

        assert!(notes(&[unsent], &["t1".to_string()]).is_empty());
    }

    #[test]
    fn build_sends_the_threads_still_unsent_and_marks_them_sent() {
        let mut unsent = thread("t1", vec![entry("user", Some("Sid"), "half a thought")]);
        unsent.pending = true;
        let mut closed = thread("t3", vec![entry("user", Some("Sid"), "never mind")]);
        closed.pending = true;
        closed.resolved = true;
        let mut threads = vec![unsent, thread("t2", vec![entry("user", Some("Sid"), "sent already")]), closed];

        let sent = send_unsent(&mut threads, "2026-10-31T09:00:00Z");

        assert_eq!(sent.iter().map(|n| n.id.as_str()).collect::<Vec<_>>(), vec!["t1"]);
        assert_eq!(sent[0].text, "half a thought");
        assert!(!threads[0].pending);
        assert_eq!(threads[0].sent_at.as_deref(), Some("2026-10-31T09:00:00Z"));
        assert_eq!(threads[1].sent_at, None, "a thread sent before keeps its own time");
        assert!(threads[2].pending, "a draft thrown away is not sent");
        assert!(send_unsent(&mut threads, "later").is_empty());
    }

    #[test]
    fn a_thread_that_is_not_there_is_left_out_rather_than_faked() {
        let threads = vec![thread("t1", vec![entry("user", None, "hi")])];

        assert!(notes(&threads, &["t9".to_string()]).is_empty());
        assert!(notes(&[], &["t1".to_string()]).is_empty());
    }
}
