//! Comment threads, typed. The sidecar JSON is the contract the app's UI
//! already reads and writes; agents work with the same file through these,
//! so a reply from either side is just another entry with an author.

use crate::sidecar;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommentEntry {
    pub id: String,
    pub text: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<String>,
    /// Files written before authors existed were the user's own.
    #[serde(default = "default_author")]
    pub author: String,
    /// The person who typed this, when a person did. Agents leave it unset:
    /// their name is the tool's, already in `author`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_name: Option<String>,
    /// Whose base this was written against, agent entries included. This is
    /// what tells two people apart once a base is shared.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_email: Option<String>,
}

impl CommentEntry {
    /// What to call whoever wrote this: a person by name, an agent by tool.
    pub fn label(&self) -> &str {
        self.author_name.as_deref().unwrap_or(&self.author)
    }
}

fn default_author() -> String {
    "user".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommentThread {
    pub id: String,
    /// The exact text the thread is anchored to.
    pub quote: String,
    /// 1-indexed source lines in the markdown file, inclusive.
    pub line_start: u32,
    pub line_end: u32,
    pub resolved: bool,
    pub comments: Vec<CommentEntry>,
}

#[derive(Serialize, Deserialize)]
struct SidecarShape {
    version: u32,
    threads: Vec<CommentThread>,
}

/// Missing or unreadable degrades to no threads; comments are never a reason
/// a plan fails to open.
pub fn read_threads(doc_path: &Path) -> Vec<CommentThread> {
    sidecar::read_comments(doc_path)
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<SidecarShape>(&raw).ok())
        .map(|s| s.threads)
        .unwrap_or_default()
}

pub fn write_threads(doc_path: &Path, threads: &[CommentThread]) -> Result<(), String> {
    if threads.is_empty() {
        return sidecar::delete_comments(doc_path);
    }
    let shape = SidecarShape {
        version: 2,
        threads: threads.to_vec(),
    };
    let json = serde_json::to_string_pretty(&shape)
        .map_err(|e| format!("Couldn't write the comments: {e}"))?;
    sidecar::write_comments(doc_path, &format!("{json}\n"))
}

/// An id with no dependency: time plus a counter is unique enough for
/// entries created one keystroke apart.
pub fn new_id() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}-{:x}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

pub fn reply(
    doc_path: &Path,
    thread_id: &str,
    text: &str,
    author: &str,
    author_email: Option<&str>,
    now: &str,
) -> Result<(), String> {
    let mut threads = read_threads(doc_path);
    let thread = threads
        .iter_mut()
        .find(|t| t.id == thread_id)
        .ok_or_else(|| format!("No thread {thread_id} on this plan."))?;
    thread.comments.push(CommentEntry {
        id: new_id(),
        text: text.to_string(),
        created_at: now.to_string(),
        edited_at: None,
        author: author.to_string(),
        author_name: None,
        author_email: author_email.map(str::to_string),
    });
    write_threads(doc_path, &threads)
}

pub fn set_resolved(doc_path: &Path, thread_id: &str, resolved: bool) -> Result<(), String> {
    let mut threads = read_threads(doc_path);
    let thread = threads
        .iter_mut()
        .find(|t| t.id == thread_id)
        .ok_or_else(|| format!("No thread {thread_id} on this plan."))?;
    thread.resolved = resolved;
    write_threads(doc_path, &threads)
}

/// The review as an agent should receive it. This format is shared with the
/// interface's "Copy for agents" button; the golden test on both sides keeps
/// them identical.
pub fn format_for_agent(threads: &[CommentThread], file_label: &str) -> String {
    let mut relevant: Vec<&CommentThread> = threads.iter().filter(|t| !t.resolved).collect();
    relevant.sort_by_key(|t| t.line_start);

    if relevant.is_empty() {
        return format!("No open review comments on `{file_label}`.\n");
    }

    let mut out = vec![
        format!(
            "Review comments on `{file_label}`. Each item quotes the exact text it refers to and the line(s) in the file. Please address the feedback in each thread."
        ),
        String::new(),
    ];
    for thread in relevant {
        let line_label = if thread.line_start == thread.line_end {
            format!("Line {}", thread.line_start)
        } else {
            format!("Lines {}-{}", thread.line_start, thread.line_end)
        };
        out.push(format!("### {line_label} (thread {})", thread.id));
        for quote_line in thread.quote.split('\n') {
            out.push(format!("> {quote_line}"));
        }
        out.push(String::new());
        let mut comments = thread.comments.iter();
        if let Some(root) = comments.next() {
            out.push(format!("- **Comment ({}):** {}", root.label(), root.text));
        }
        for entry in comments {
            out.push(format!("  - **Reply ({}):** {}", entry.label(), entry.text));
        }
        out.push(String::new());
    }
    format!("{}\n", out.join("\n").trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thread(id: &str, line: u32, resolved: bool) -> CommentThread {
        CommentThread {
            id: id.to_string(),
            quote: "the quoted text".to_string(),
            line_start: line,
            line_end: line,
            resolved,
            comments: vec![CommentEntry {
                id: "c1".to_string(),
                text: "please clarify".to_string(),
                created_at: "2026-08-16T10:00:00Z".to_string(),
                edited_at: None,
                author: "user".to_string(),
                author_name: Some("Sid".to_string()),
                author_email: Some("sid@hypotenuse.ai".to_string()),
            }],
        }
    }

    fn temp_doc(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let doc = dir.join("plan.md");
        std::fs::write(&doc, "# Plan\n").unwrap();
        doc
    }

    #[test]
    fn threads_round_trip_through_the_sidecar() {
        let doc = temp_doc("openplan-core-comments-roundtrip");

        write_threads(&doc, &[thread("t1", 3, false)]).unwrap();

        assert_eq!(read_threads(&doc), vec![thread("t1", 3, false)]);
        let _ = std::fs::remove_dir_all(doc.parent().unwrap());
    }

    #[test]
    fn an_agent_reply_lands_with_its_author() {
        let doc = temp_doc("openplan-core-comments-reply");
        write_threads(&doc, &[thread("t1", 3, false)]).unwrap();

        reply(
            &doc,
            "t1",
            "done, see the new section",
            "claude-code",
            Some("sid@hypotenuse.ai"),
            "2026-08-16T11:00:00Z",
        )
            .unwrap();

        let threads = read_threads(&doc);
        assert_eq!(threads[0].comments.len(), 2);
        assert_eq!(threads[0].comments[1].author, "claude-code");
        let _ = std::fs::remove_dir_all(doc.parent().unwrap());
    }

    #[test]
    fn resolving_marks_the_thread_and_replying_to_nothing_says_so() {
        let doc = temp_doc("openplan-core-comments-resolve");
        write_threads(&doc, &[thread("t1", 3, false)]).unwrap();

        set_resolved(&doc, "t1", true).unwrap();
        assert!(read_threads(&doc)[0].resolved);

        let err = reply(&doc, "missing", "x", "codex", None, "now").unwrap_err();
        assert!(err.contains("No thread missing"));
        let _ = std::fs::remove_dir_all(doc.parent().unwrap());
    }

    #[test]
    fn deleting_the_last_thread_removes_the_sidecar() {
        let doc = temp_doc("openplan-core-comments-empty");
        write_threads(&doc, &[thread("t1", 3, false)]).unwrap();

        write_threads(&doc, &[]).unwrap();

        assert!(crate::sidecar::read_comments(&doc).unwrap().is_none());
        let _ = std::fs::remove_dir_all(doc.parent().unwrap());
    }

    #[test]
    fn the_agent_export_reads_like_a_review() {
        let mut t = thread("t1", 3, false);
        t.line_end = 5;
        t.comments.push(CommentEntry {
            id: "c2".to_string(),
            text: "because of X".to_string(),
            created_at: "2026-08-16T11:00:00Z".to_string(),
            edited_at: None,
            author: "claude-code".to_string(),
            author_name: None,
            author_email: Some("sid@hypotenuse.ai".to_string()),
        });

        let out = format_for_agent(&[t, thread("t2", 1, true)], "plans/auth.md");

        assert!(out.contains("Review comments on `plans/auth.md`"));
        assert!(out.contains("### Lines 3-5 (thread t1)"));
        assert!(out.contains("> the quoted text"));
        // A person is named; an agent is its tool, whoever it ran for.
        assert!(out.contains("- **Comment (Sid):** please clarify"));
        assert!(out.contains("  - **Reply (claude-code):** because of X"));
        assert!(!out.contains("t2"), "resolved threads stay out");
    }

    #[test]
    fn no_open_threads_says_so_plainly() {
        let out = format_for_agent(&[thread("t1", 1, true)], "plans/auth.md");

        assert_eq!(out, "No open review comments on `plans/auth.md`.\n");
    }
}
