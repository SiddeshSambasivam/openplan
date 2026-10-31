//! What a plan is on disk: markdown or HTML, with optional frontmatter
//! carrying the few things the app tracks. An HTML plan keeps that
//! frontmatter inside a comment so a browser still renders the file. The body
//! is never rewritten — a plan is the author's text, and tooling only ever
//! touches the header.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Where a plan stands. Stored, never derived: the one field anyone sets.
/// Completed and archived are the person's to set; agents get as far as
/// in-review.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    /// Filed and open for review; nobody has started on it.
    #[default]
    Draft,
    /// The agent asks its questions and records the answers.
    Alignment,
    /// A session is, or was, working on it.
    InProgress,
    /// The agent opened a PR; the plan waits on a person.
    InReview,
    /// The person said the work is done.
    Completed,
    /// Done and put away.
    Archived,
}

impl Status {
    /// In the order work moves through them.
    pub const ALL: [Status; 6] = [
        Status::Draft,
        Status::Alignment,
        Status::InProgress,
        Status::InReview,
        Status::Completed,
        Status::Archived,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Status::Draft => "draft",
            Status::Alignment => "alignment",
            Status::InProgress => "in-progress",
            Status::InReview => "in-review",
            Status::Completed => "completed",
            Status::Archived => "archived",
        }
    }

    /// The values this build writes, plus the vocabulary of the field as it
    /// was before 0.2.0, so a base written by an older build still reads.
    pub fn parse(value: &str) -> Option<Status> {
        match value.trim() {
            "draft" => Some(Status::Draft),
            "alignment" => Some(Status::Alignment),
            "in-progress" | "active" => Some(Status::InProgress),
            "in-review" | "approved" => Some(Status::InReview),
            "completed" | "done" => Some(Status::Completed),
            "archived" => Some(Status::Archived),
            _ => None,
        }
    }
}

/// A folder name as it is stored: one line of plain words. The characters
/// that would end or split a YAML list item are dropped rather than quoted,
/// so every tool that reads the file sees the same names.
pub fn folder_name(text: &str) -> String {
    text.chars()
        .filter(|c| !matches!(c, ',' | '[' | ']' | '{' | '}' | '"' | '\'' | ':' | '#'))
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Folder names cleaned, empty ones dropped, and each kept once whatever
/// its case, in the order given.
pub fn folder_list(names: Vec<String>) -> Vec<String> {
    let mut kept: Vec<String> = Vec::new();
    for name in names.iter().map(|n| folder_name(n)) {
        let lower = name.to_lowercase();
        if !name.is_empty() && !kept.iter().any(|k| k.to_lowercase() == lower) {
            kept.push(name);
        }
    }
    kept
}

/// What the app knows about a plan without reading its body.
#[derive(Debug, Clone, PartialEq)]
pub struct PlanMeta {
    pub id: String,
    pub title: String,
    pub status: Status,
    /// What kind of work this is: feature, bug, migration, research, audit.
    /// Free text on disk so a base is never refused for a word this build
    /// does not know; the standards say which ones agents should use.
    pub plan_type: Option<String>,
    pub source: String,
    /// Labels the person puts on a plan to find it again. A plan can carry
    /// several, or none.
    pub folders: Vec<String>,
    /// The pull request a plan from before 0.3.0 went out in. Read only:
    /// the line stays as it was, and the work record is where PRs go now.
    pub pr: Option<String>,
    pub created: Option<String>,
    pub updated: Option<String>,
    /// When the plan was marked completed. Cleared when it moves on.
    pub completed: Option<String>,
    /// One of the plans onboarding writes to show the app. Agents never see
    /// it.
    pub demo: bool,
}

impl PlanMeta {
    /// Moves the plan, keeping `completed` in step: set the first time it
    /// is completed, gone once it is anything else.
    pub fn set_status(&mut self, status: Status, now: &str) {
        self.completed = match status {
            Status::Completed if self.status == Status::Completed => {
                self.completed.take().or_else(|| Some(now.to_string()))
            }
            Status::Completed => Some(now.to_string()),
            _ => None,
        };
        self.status = status;
    }
}

/// A parsed plan. `frontmatter` keeps the raw lines so keys this build knows
/// nothing about survive a rewrite untouched.
#[derive(Debug, Clone, PartialEq)]
pub struct Plan {
    pub meta: PlanMeta,
    pub frontmatter: Vec<(String, String)>,
    pub body: String,
    /// True when the file carried no frontmatter and the metadata was derived.
    pub derived: bool,
    /// True for a plan written as HTML, whose frontmatter is wrapped in a
    /// comment so the file still opens as a page.
    pub html: bool,
}

const FENCE: &str = "---";
const COMMENT_OPEN: &str = "<!--";
const COMMENT_CLOSE: &str = "-->";

/// Whether a path names an HTML plan. The extension is what decides which
/// form its frontmatter takes.
pub fn is_html(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"))
}

fn strip_newline(text: &str) -> Option<&str> {
    text.strip_prefix('\n').or_else(|| text.strip_prefix("\r\n"))
}

/// Splits leading `---` fenced frontmatter from the body. Returns `None` when
/// there is no frontmatter, which is the normal case for a plan someone wrote
/// by hand.
fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
    let rest = text.strip_prefix(FENCE)?;
    let rest = strip_newline(rest)?;
    // The closing fence is a line of its own.
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end() == FENCE {
            let body_start = offset + line.len();
            return Some((&rest[..offset], &rest[body_start..]));
        }
        offset += line.len();
    }
    None
}

/// The same block, wrapped in a comment so an HTML plan opens as a page
/// rather than showing its metadata as text.
fn split_commented_frontmatter(text: &str) -> Option<(&str, &str)> {
    let rest = strip_newline(text.strip_prefix(COMMENT_OPEN)?)?;
    let (block, after) = split_frontmatter(rest)?;
    let body = after.strip_prefix(COMMENT_CLOSE)?;
    Some((block, strip_newline(body).unwrap_or(body)))
}

/// Deliberately not a YAML parser: plan frontmatter is flat `key: value`, and
/// anything richer belongs in the body where a person will read it. The one
/// exception is a list written as `- item` lines under its key, which is
/// folded into the `[a, b]` form so it survives a rewrite.
fn parse_pairs(block: &str) -> Vec<(String, String)> {
    let mut pairs: Vec<(String, String)> = Vec::new();
    let mut items: Vec<String> = Vec::new();
    for line in block.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(item) = line.strip_prefix('-').filter(|_| !pairs.is_empty()) {
            items.push(item.trim().trim_matches('"').to_string());
            continue;
        }
        fold_items(&mut pairs, &mut items);
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        pairs.push((
            key.trim().to_string(),
            value.trim().trim_matches('"').to_string(),
        ));
    }
    fold_items(&mut pairs, &mut items);
    pairs
}

fn fold_items(pairs: &mut [(String, String)], items: &mut Vec<String>) {
    if items.is_empty() {
        return;
    }
    if let Some((_, value)) = pairs.last_mut().filter(|(_, v)| v.is_empty()) {
        *value = flow_list(items);
    }
    items.clear();
}

/// The items of `[a, b]` or of plain `a, b`.
fn list_items(value: &str) -> Vec<String> {
    let inner = value.trim();
    let inner = inner
        .strip_prefix('[')
        .and_then(|v| v.strip_suffix(']'))
        .unwrap_or(inner);
    inner
        .split(',')
        .map(|item| item.trim().trim_matches('"').trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn flow_list(items: &[String]) -> String {
    format!("[{}]", items.join(", "))
}

fn lookup<'a>(pairs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    pairs
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
        .filter(|v| !v.is_empty())
}

/// Before 0.2.0 a plan was archived by a tag rather than a status. The line
/// is kept as it was and never written again; only its meaning is read.
fn status_from(pairs: &[(String, String)]) -> Status {
    if let Some(status) = lookup(pairs, "status").and_then(Status::parse) {
        return status;
    }
    let archived = lookup(pairs, "tags")
        .map(|tags| list_items(tags).iter().any(|t| t == "archived"))
        .unwrap_or(false);
    if archived {
        Status::Archived
    } else {
        Status::Draft
    }
}

/// The first heading, markdown or HTML, falling back to the filename — what
/// to call a plan that never declared a title.
fn title_from(body: &str, fallback: &str) -> String {
    body.lines()
        .find_map(|line| line.strip_prefix("# "))
        .map(|t| t.trim().to_string())
        .or_else(|| first_h1(body))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn first_h1(body: &str) -> Option<String> {
    let start = body.to_lowercase().find("<h1")?;
    let open = body[start..].find('>')? + start + 1;
    let end = body[open..].to_lowercase().find("</h1>")? + open;
    Some(body[open..end].trim().to_string())
}

/// Reads a plan. A file with no frontmatter is still a plan: its title comes
/// from the first heading and the rest takes sensible defaults, so dropping a
/// folder of existing markdown in works without a migration.
pub fn parse(text: &str, path: &Path) -> Plan {
    let id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("untitled")
        .to_string();

    let html = is_html(path);
    let split = if html {
        split_commented_frontmatter(text)
    } else {
        split_frontmatter(text)
    };
    let (block, body) = match split {
        Some((block, body)) => (block, body),
        None => {
            return Plan {
                meta: PlanMeta {
                    title: title_from(text, &id),
                    id,
                    status: Status::Draft,
                    plan_type: None,
                    source: "manual".to_string(),
                    folders: Vec::new(),
                    pr: None,
                    created: None,
                    updated: None,
                    completed: None,
                    demo: false,
                },
                frontmatter: Vec::new(),
                body: text.to_string(),
                derived: true,
                html,
            };
        }
    };

    let pairs = parse_pairs(block);
    let meta = PlanMeta {
        id: lookup(&pairs, "id").unwrap_or(&id).to_string(),
        title: lookup(&pairs, "title")
            .map(str::to_string)
            .unwrap_or_else(|| title_from(body, &id)),
        status: status_from(&pairs),
        plan_type: lookup(&pairs, "type").map(str::to_string),
        source: lookup(&pairs, "source").unwrap_or("manual").to_string(),
        folders: lookup(&pairs, "folders").map(list_items).unwrap_or_default(),
        pr: lookup(&pairs, "pr").map(str::to_string),
        created: lookup(&pairs, "created").map(str::to_string),
        updated: lookup(&pairs, "updated").map(str::to_string),
        completed: lookup(&pairs, "completed").map(str::to_string),
        demo: lookup(&pairs, "demo") == Some("true"),
    };
    Plan {
        meta,
        frontmatter: pairs,
        body: body.to_string(),
        derived: false,
        html,
    }
}

/// Writes a plan back out. The body is reproduced byte for byte, and
/// frontmatter keys this build does not understand are preserved in place.
/// `project` and `pr` from before 0.3.0 are among them: kept, never written.
pub fn serialize(plan: &Plan) -> String {
    let mut pairs = plan.frontmatter.clone();
    let mut set = |key: &str, value: Option<&str>| {
        let at = pairs.iter().position(|(k, _)| k == key);
        match (at, value) {
            (Some(i), Some(value)) => pairs[i].1 = value.to_string(),
            (None, Some(value)) => pairs.push((key.to_string(), value.to_string())),
            (Some(i), None) => {
                pairs.remove(i);
            }
            (None, None) => {}
        }
    };
    let meta = &plan.meta;
    set("id", Some(&meta.id));
    set("title", Some(&meta.title));
    set("status", Some(meta.status.as_str()));
    if let Some(plan_type) = &meta.plan_type {
        set("type", Some(plan_type));
    }
    set("source", Some(&meta.source));
    let folders = (!meta.folders.is_empty()).then(|| flow_list(&meta.folders));
    set("folders", folders.as_deref());
    if let Some(created) = &meta.created {
        set("created", Some(created));
    }
    if let Some(updated) = &meta.updated {
        set("updated", Some(updated));
    }
    set("completed", meta.completed.as_deref());
    set("demo", meta.demo.then_some("true"));

    let mut out = String::new();
    if plan.html {
        out.push_str(COMMENT_OPEN);
        out.push('\n');
    }
    out.push_str(FENCE);
    out.push('\n');
    for (key, value) in &pairs {
        out.push_str(key);
        out.push_str(": ");
        out.push_str(value);
        out.push('\n');
    }
    out.push_str(FENCE);
    out.push('\n');
    if plan.html {
        out.push_str(COMMENT_CLOSE);
        out.push('\n');
    }
    out.push_str(&plan.body);
    out
}

/// A filename for a plan, made from its title. Agents pick titles, not
/// filenames, and a title is what someone recognises in a directory listing.
pub fn slugify(title: &str) -> String {
    let mut slug = String::new();
    let mut pending_dash = false;
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            pending_dash = false;
            slug.push(ch.to_ascii_lowercase());
        } else {
            pending_dash = true;
        }
    }
    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug.chars().take(60).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PATH: &str = "/base/plans/auth-refactor.md";

    fn parse_str(text: &str) -> Plan {
        parse(text, Path::new(PATH))
    }

    #[test]
    fn reads_the_metadata_a_plan_declares() {
        let plan = parse_str(
            "---\nid: auth-refactor\ntitle: Auth refactor\nstatus: in-review\ntype: feature\n\
             source: claude-code\nproject: github.com/acme/api\npr: https://github.com/acme/api/pull/4\n\
             created: 2026-08-15T10:00:00Z\n---\n# Body\n",
        );

        assert_eq!(plan.meta.title, "Auth refactor");
        assert_eq!(plan.meta.status, Status::InReview);
        assert_eq!(plan.meta.plan_type.as_deref(), Some("feature"));
        assert_eq!(plan.meta.source, "claude-code");
        assert_eq!(plan.meta.pr.as_deref(), Some("https://github.com/acme/api/pull/4"));
        assert_eq!(plan.body, "# Body\n");
        assert!(!plan.derived);
    }

    #[test]
    fn every_status_this_build_writes_reads_back() {
        for status in Status::ALL {
            let mut plan = parse_str("---\ntitle: X\n---\n# X\n");
            plan.meta.status = status;

            let out = serialize(&plan);

            assert!(out.contains(&format!("status: {}\n", status.as_str())), "{out}");
            assert_eq!(parse_str(&out).meta.status, status);
        }
    }

    #[test]
    fn the_six_statuses_run_in_the_order_work_moves() {
        let words: Vec<&str> = Status::ALL.iter().map(Status::as_str).collect();

        assert_eq!(
            words,
            ["draft", "alignment", "in-progress", "in-review", "completed", "archived"]
        );
    }

    #[test]
    fn folders_read_from_a_flow_list() {
        let plan = parse_str("---\ntitle: X\nfolders: [Search, \"Q3 launch\"]\n---\n# X\n");

        assert_eq!(plan.meta.folders, ["Search", "Q3 launch"]);
    }

    #[test]
    fn folders_read_from_a_block_list() {
        let plan = parse_str("---\ntitle: X\nfolders:\n  - Search\n  - Q3 launch\nsource: codex\n---\n# X\n");

        assert_eq!(plan.meta.folders, ["Search", "Q3 launch"]);
        assert_eq!(plan.meta.source, "codex");
    }

    #[test]
    fn folders_are_written_as_a_flow_list_and_read_back() {
        let block = parse_str("---\ntitle: X\nfolders:\n  - Search\n  - Infra\n---\n# X\n");

        let out = serialize(&block);

        assert!(out.contains("folders: [Search, Infra]\n"), "{out}");
        assert!(!out.contains("- Search"), "the block form is replaced: {out}");
        assert_eq!(parse_str(&out).meta.folders, ["Search", "Infra"]);
    }

    #[test]
    fn a_plan_in_no_folder_writes_no_folders_line() {
        let mut plan = parse_str("---\ntitle: X\nfolders: [Search]\n---\n# X\n");
        plan.meta.folders.clear();

        assert!(!serialize(&plan).contains("folders"));
    }

    #[test]
    fn a_folder_name_loses_what_would_break_the_list() {
        assert_eq!(folder_name("  Q3   launch "), "Q3 launch");
        assert_eq!(folder_name("a, [b]: #c \"d\""), "a b c d");
        assert_eq!(folder_name(" , "), "");
    }

    #[test]
    fn completing_a_plan_records_when() {
        let mut plan = parse_str("---\ntitle: X\nstatus: in-review\n---\n# X\n");

        plan.meta.set_status(Status::Completed, "2026-10-28T10:00:00Z");

        assert_eq!(plan.meta.completed.as_deref(), Some("2026-10-28T10:00:00Z"));
        let out = serialize(&plan);
        assert!(out.contains("completed: 2026-10-28T10:00:00Z\n"), "{out}");
        assert_eq!(parse_str(&out).meta.completed.as_deref(), Some("2026-10-28T10:00:00Z"));
    }

    #[test]
    fn completing_a_completed_plan_keeps_the_first_date() {
        let mut plan = parse_str(
            "---\ntitle: X\nstatus: completed\ncompleted: 2026-10-01T10:00:00Z\n---\n# X\n",
        );

        plan.meta.set_status(Status::Completed, "2026-10-28T10:00:00Z");

        assert_eq!(plan.meta.completed.as_deref(), Some("2026-10-01T10:00:00Z"));
    }

    #[test]
    fn moving_a_plan_off_completed_clears_the_date() {
        for status in [Status::InProgress, Status::Archived, Status::Draft] {
            let mut plan = parse_str(
                "---\ntitle: X\nstatus: completed\ncompleted: 2026-10-01T10:00:00Z\n---\n# X\n",
            );

            plan.meta.set_status(status, "2026-10-28T10:00:00Z");

            assert_eq!(plan.meta.completed, None, "{status:?}");
            assert!(!serialize(&plan).contains("completed:"), "{status:?}");
        }
    }

    #[test]
    fn project_and_pr_are_kept_as_they_were_and_never_written() {
        let text = "---\ntitle: X\nproject: github.com/acme/api\npr: https://github.com/acme/api/pull/4\n---\n# X\n";
        let mut plan = parse_str(text);
        plan.meta.pr = Some("https://github.com/acme/api/pull/9".into());

        let out = serialize(&plan);

        assert!(out.contains("project: github.com/acme/api\n"), "{out}");
        assert!(out.contains("pr: https://github.com/acme/api/pull/4\n"), "{out}");
        assert!(!out.contains("pull/9"), "{out}");
    }

    #[test]
    fn a_pr_is_never_added_to_a_plan_that_had_none() {
        let mut plan = parse_str("---\ntitle: X\n---\n# X\n");
        plan.meta.pr = Some("https://github.com/acme/api/pull/9".into());

        assert!(!serialize(&plan).contains("pr:"));
    }

    #[test]
    fn markdown_without_frontmatter_is_still_a_plan() {
        let plan = parse_str("# Just some notes\n\nwritten by hand\n");

        assert_eq!(plan.meta.title, "Just some notes");
        assert_eq!(plan.meta.id, "auth-refactor");
        assert_eq!(plan.meta.status, Status::Draft);
        assert_eq!(plan.meta.source, "manual");
        assert_eq!(plan.body, "# Just some notes\n\nwritten by hand\n");
        assert!(plan.derived);
    }

    #[test]
    fn falls_back_to_the_filename_when_there_is_no_heading() {
        assert_eq!(parse_str("no heading here\n").meta.title, "auth-refactor");
    }

    #[test]
    fn a_plan_with_no_status_line_is_a_draft() {
        assert_eq!(parse_str("---\ntitle: X\n---\n# X\n").meta.status, Status::Draft);
    }

    #[test]
    fn the_old_status_vocabulary_still_reads() {
        for (old, new) in [
            ("done", Status::Completed),
            ("archived", Status::Archived),
            ("approved", Status::InReview),
            ("active", Status::InProgress),
            ("in-progress", Status::InProgress),
        ] {
            let plan = parse_str(&format!("---\nstatus: {old}\ntitle: X\n---\n# X\n"));
            assert_eq!(plan.meta.status, new, "{old}");
        }
    }

    #[test]
    fn a_word_this_build_does_not_know_reads_as_draft_and_is_replaced_on_write() {
        let plan = parse_str("---\nstatus: blocked\ntitle: X\n---\n# X\n");

        assert_eq!(plan.meta.status, Status::Draft);
        assert!(serialize(&plan).contains("status: draft\n"));
    }

    #[test]
    fn an_archived_tag_from_before_0_2_reads_as_archived_and_the_line_is_kept() {
        let plan = parse_str("---\ntitle: X\ntags: infra, archived\nsource: claude-code\n---\n# X\n");

        assert_eq!(plan.meta.status, Status::Archived);
        let out = serialize(&plan);
        assert!(out.contains("tags: infra, archived\n"), "the line is not this build's to remove: {out}");
        assert!(out.contains("status: archived\n"), "{out}");
    }

    #[test]
    fn an_archived_tag_in_a_list_reads_as_archived() {
        let flow = parse_str("---\ntitle: X\ntags: [infra, archived]\n---\n# X\n");
        let block = parse_str("---\ntitle: X\ntags:\n  - infra\n  - archived\n---\n# X\n");

        assert_eq!(flow.meta.status, Status::Archived);
        assert_eq!(block.meta.status, Status::Archived);
    }

    #[test]
    fn an_explicit_status_outranks_an_old_archived_tag() {
        let plan = parse_str("---\nstatus: in-progress\ntags: archived\ntitle: X\n---\n# X\n");

        assert_eq!(plan.meta.status, Status::InProgress);
    }

    #[test]
    fn other_old_tags_say_nothing_about_status() {
        assert_eq!(
            parse_str("---\ntitle: X\ntags: infra, search\n---\n# X\n").meta.status,
            Status::Draft
        );
    }

    #[test]
    fn status_is_always_written() {
        let out = serialize(&parse_str("---\ntitle: X\n---\n# X\n"));

        assert!(out.contains("status: draft\n"), "{out}");
    }

    #[test]
    fn status_and_type_round_trip() {
        let mut plan = parse_str("---\ntitle: X\n---\n# X\n");
        plan.meta.status = Status::InReview;
        plan.meta.plan_type = Some("bug".into());

        let back = parse_str(&serialize(&plan));

        assert_eq!(back.meta.status, Status::InReview);
        assert_eq!(back.meta.plan_type.as_deref(), Some("bug"));
    }

    #[test]
    fn a_body_survives_a_round_trip_byte_for_byte() {
        let body = "# Auth refactor\n\n```yaml\n---\nnot: frontmatter\n---\n```\n\n- [ ] step\n";
        let text = format!("---\ntitle: Auth refactor\n---\n{body}");

        let round_tripped = serialize(&parse_str(&text));

        assert_eq!(parse_str(&round_tripped).body, body);
    }

    #[test]
    fn keys_this_build_does_not_know_about_are_kept() {
        let plan = parse_str("---\ntitle: X\nreviewers: sid, josh\n---\n# X\n");

        let out = serialize(&plan);

        assert!(out.contains("reviewers: sid, josh"), "got: {out}");
    }

    #[test]
    fn writing_a_plan_that_had_none_gives_it_frontmatter() {
        let mut plan = parse_str("# Hand written\n\nbody\n");
        plan.meta.status = Status::InProgress;

        let out = serialize(&plan);

        assert!(out.starts_with("---\n"));
        assert!(out.contains("status: in-progress\n"));
        assert!(out.ends_with("# Hand written\n\nbody\n"));
    }

    #[test]
    fn a_demo_plan_says_so_in_its_frontmatter() {
        let demo = parse_str("---\ntitle: Demo: add dark mode\ndemo: true\n---\n# X\n");
        let ordinary = parse_str("---\ntitle: X\n---\n# X\n");

        assert!(demo.meta.demo);
        assert!(!ordinary.meta.demo);
        assert!(!parse_str("# Hand written\n").meta.demo);
        assert!(serialize(&demo).contains("demo: true\n"));
        assert!(!serialize(&ordinary).contains("demo"));

        let mut flagged = ordinary.clone();
        flagged.meta.demo = true;
        assert!(parse_str(&serialize(&flagged)).meta.demo);
        flagged.meta.demo = false;
        assert!(!serialize(&flagged).contains("demo"));
    }

    #[test]
    fn an_unterminated_fence_is_body_not_metadata() {
        let text = "---\ntitle: X\n\n# no closing fence\n";

        let plan = parse_str(text);

        assert_eq!(plan.body, text);
        assert!(plan.derived);
    }

    const HTML_PATH: &str = "/base/plans/auth-refactor.html";

    fn parse_html(text: &str) -> Plan {
        parse(text, Path::new(HTML_PATH))
    }

    #[test]
    fn an_html_plan_carries_its_frontmatter_in_a_comment() {
        let plan = parse_html(
            "<!--\n---\nid: auth-refactor\ntitle: Auth refactor\nstatus: in-progress\n\
             type: feature\n---\n-->\n<h1>Auth refactor</h1>\n",
        );

        assert_eq!(plan.meta.title, "Auth refactor");
        assert_eq!(plan.meta.status, Status::InProgress);
        assert_eq!(plan.meta.plan_type.as_deref(), Some("feature"));
        assert_eq!(plan.body, "<h1>Auth refactor</h1>\n");
        assert!(!plan.derived);
        assert!(plan.html);
    }

    #[test]
    fn an_html_plan_is_written_back_the_way_it_was_read() {
        let text = "<!--\n---\nid: auth-refactor\ntitle: Auth refactor\nstatus: draft\n\
                    source: manual\n---\n-->\n<h1>Auth refactor</h1>\n<p>body</p>\n";

        assert_eq!(serialize(&parse_html(text)), text);
    }

    #[test]
    fn an_html_body_survives_a_round_trip_byte_for_byte() {
        let body = "<h1>Auth refactor</h1>\n<pre>---\nnot: frontmatter\n---</pre>\n";
        let text = format!("<!--\n---\ntitle: Auth refactor\n---\n-->\n{body}");

        assert_eq!(parse_html(&serialize(&parse_html(&text))).body, body);
    }

    #[test]
    fn an_html_plan_that_never_had_frontmatter_gets_it_in_a_comment() {
        let mut plan = parse_html("<h1>Hand written</h1>\n");
        plan.meta.status = Status::InReview;

        let out = serialize(&plan);

        assert!(out.starts_with("<!--\n---\n"), "{out}");
        assert!(out.contains("status: in-review\n"), "{out}");
        assert!(out.ends_with("-->\n<h1>Hand written</h1>\n"), "{out}");
    }

    #[test]
    fn an_html_plan_without_frontmatter_takes_its_title_from_the_first_heading() {
        let plan = parse_html("<h1 class=\"t\">Just some notes</h1>\n<p>x</p>\n");

        assert_eq!(plan.meta.title, "Just some notes");
        assert!(plan.derived);
    }

    #[test]
    fn a_markdown_plan_is_never_written_as_a_comment() {
        assert!(serialize(&parse_str("---\ntitle: X\n---\n# X\n")).starts_with("---\n"));
    }

    #[test]
    fn an_unclosed_comment_is_body_not_metadata() {
        let text = "<!--\n---\ntitle: X\n---\n<h1>no closing comment</h1>\n";

        let plan = parse_html(text);

        assert_eq!(plan.body, text);
        assert!(plan.derived);
    }

    #[test]
    fn a_title_becomes_a_filename_someone_would_recognise() {
        assert_eq!(slugify("Auth refactor"), "auth-refactor");
        assert_eq!(slugify("PDB filter schema bug: number `between`"), "pdb-filter-schema-bug-number-between");
        assert_eq!(slugify("  React 17 → 19  "), "react-17-19");
    }

    #[test]
    fn a_title_with_nothing_usable_still_gives_a_filename() {
        assert_eq!(slugify("→ ✨ ///"), "untitled");
        assert_eq!(slugify(""), "untitled");
    }
}
