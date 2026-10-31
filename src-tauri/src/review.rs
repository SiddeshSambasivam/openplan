//! What the comment threads across the base mean for the person: how much is
//! open on each plan, and where an agent has answered and is waiting. Read in
//! one pass here rather than a call per plan from the interface.

use openplan_core::comments::{self, CommentThread};
use openplan_core::library;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSummary {
    path: PathBuf,
    open: usize,
    answered: bool,
}

/// Whether a write sends a review: a thread the person was still writing is
/// no longer pending.
pub fn sends_a_review(before: &[CommentThread], after: &[CommentThread]) -> bool {
    after.iter().any(|thread| {
        !thread.pending && before.iter().any(|old| old.id == thread.id && old.pending)
    })
}

/// An open thread an agent spoke last in is one the person has not answered.
/// A pending thread is nobody's business but the person writing it, so it is
/// not counted as review work either.
fn summarise(threads: &[CommentThread]) -> (usize, bool) {
    let open: Vec<&CommentThread> = threads
        .iter()
        .filter(|t| !t.resolved && !t.pending)
        .collect();
    let answered = open
        .iter()
        .any(|t| t.comments.last().is_some_and(|c| c.author != "user"));
    (open.len(), answered)
}

#[tauri::command]
pub async fn review_summaries(
    state: tauri::State<'_, crate::plans::BaseState>,
) -> Result<Vec<ReviewSummary>, String> {
    Ok(library::scan(state.get()?)
        .into_iter()
        .filter_map(|entry| {
            // A set keeps its threads on the document they were written on,
            // so the plan's count is all of its documents together.
            let folder = entry.path.parent().map(|p| p.to_path_buf());
            let mut threads = Vec::new();
            if entry.documents.is_empty() {
                threads.extend(comments::read_threads(&entry.path));
            } else if let Some(folder) = folder {
                for document in &entry.documents {
                    threads.extend(comments::read_threads(&folder.join(document)));
                }
            }
            let (open, answered) = summarise(&threads);
            (open > 0).then_some(ReviewSummary {
                path: entry.path,
                open,
                answered,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use openplan_core::comments::CommentEntry;

    fn entry(author: &str) -> CommentEntry {
        CommentEntry {
            id: comments::new_id(),
            text: "…".to_string(),
            created_at: "2026-09-22T10:00:00Z".to_string(),
            edited_at: None,
            author: author.to_string(),
            author_name: None,
            author_email: None,
        }
    }

    fn thread(resolved: bool, authors: &[&str]) -> CommentThread {
        CommentThread {
            id: comments::new_id(),
            quote: "a line".to_string(),
            line_start: 1,
            line_end: 1,
            resolved,
            pending: false,
            resolved_by: None,
            resolved_at: None,
            sent_at: None,
            comments: authors.iter().map(|a| entry(a)).collect(),
        }
    }

    #[test]
    fn counts_only_what_is_still_open() {
        let threads = vec![thread(true, &["user"]), thread(false, &["user"])];

        assert_eq!(summarise(&threads), (1, false));
    }

    #[test]
    fn an_agent_with_the_last_word_is_waiting() {
        let threads = vec![thread(false, &["user", "claude-code"])];

        assert_eq!(summarise(&threads), (1, true));
    }

    #[test]
    fn a_resolved_thread_is_not_waiting() {
        let threads = vec![thread(true, &["user", "claude-code"])];

        assert_eq!(summarise(&threads), (0, false));
    }

    #[test]
    fn a_thread_still_being_written_is_not_review_work() {
        let mut unsent = thread(false, &["user"]);
        unsent.pending = true;
        let threads = vec![unsent, thread(false, &["user"])];

        assert_eq!(summarise(&threads), (1, false));
    }

    #[test]
    fn a_review_is_sent_when_a_pending_thread_stops_being_pending() {
        let mut written = thread(false, &["user"]);
        written.pending = true;
        let mut sent = written.clone();
        sent.pending = false;
        let mut reply = sent.clone();
        reply.comments.push(entry("user"));

        assert!(sends_a_review(&[written.clone()], &[sent.clone()]));
        assert!(!sends_a_review(&[written.clone()], &[written.clone()]), "still being written");
        assert!(!sends_a_review(&[sent.clone()], &[reply]), "a reply to a thread already sent");
        assert!(!sends_a_review(&[written], &[]), "a draft thread thrown away");
    }

    #[test]
    fn the_person_answering_last_ends_the_wait() {
        let threads = vec![thread(false, &["user", "claude-code", "user"])];

        assert_eq!(summarise(&threads), (1, false));
    }
}
