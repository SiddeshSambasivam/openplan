//! What a plan is on disk: markdown, with optional frontmatter carrying the
//! few things the app tracks. The body is never rewritten — a plan is the
//! author's text, and tooling only ever touches the header.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Where a plan stands. Stored, never derived: the one field anyone sets.
/// Completed is the person's to set; agents get as far as in-review.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    /// Filed; no session has started on it.
    #[default]
    Draft,
    /// A session is, or was, working on it.
    InProgress,
    /// The agent opened a PR; the plan waits on a person.
    InReview,
    /// The person said the work is done.
    Completed,
}

impl Status {
    pub const ALL: [Status; 4] = [
        Status::Draft,
        Status::InProgress,
        Status::InReview,
        Status::Completed,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Status::Draft => "draft",
            Status::InProgress => "in-progress",
            Status::InReview => "in-review",
            Status::Completed => "completed",
        }
    }

    /// The four values this build writes, plus the vocabulary of the field as
    /// it was before 0.2.0, so a base written by an older build still reads.
    pub fn parse(value: &str) -> Option<Status> {
        match value.trim() {
            "draft" => Some(Status::Draft),
            "in-progress" | "active" => Some(Status::InProgress),
            "in-review" | "approved" => Some(Status::InReview),
            "completed" | "done" | "archived" => Some(Status::Completed),
            _ => None,
        }
    }
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
    pub project: Option<String>,
    /// The pull request the work went out in, set with in-review.
    pub pr: Option<String>,
    pub created: Option<String>,
    pub updated: Option<String>,
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
}

const FENCE: &str = "---";

/// Splits leading `---` fenced frontmatter from the body. Returns `None` when
/// there is no frontmatter, which is the normal case for a plan someone wrote
/// by hand.
fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
    let rest = text.strip_prefix(FENCE)?;
    let rest = rest.strip_prefix('\n').or_else(|| rest.strip_prefix("\r\n"))?;
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

/// Deliberately not a YAML parser: plan frontmatter is flat `key: value`, and
/// anything richer belongs in the body where a person will read it.
fn parse_pairs(block: &str) -> Vec<(String, String)> {
    block
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once(':')?;
            Some((
                key.trim().to_string(),
                value.trim().trim_matches('"').to_string(),
            ))
        })
        .collect()
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
        .map(|tags| tags.split(',').any(|t| t.trim() == "archived"))
        .unwrap_or(false);
    if archived {
        Status::Completed
    } else {
        Status::Draft
    }
}

/// The first heading, falling back to the filename — what to call a plan that
/// never declared a title.
fn title_from(body: &str, fallback: &str) -> String {
    body.lines()
        .find_map(|line| line.strip_prefix("# "))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| fallback.to_string())
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

    let (block, body) = match split_frontmatter(text) {
        Some((block, body)) => (block, body),
        None => {
            return Plan {
                meta: PlanMeta {
                    title: title_from(text, &id),
                    id,
                    status: Status::Draft,
                    plan_type: None,
                    source: "manual".to_string(),
                    project: None,
                    pr: None,
                    created: None,
                    updated: None,
                },
                frontmatter: Vec::new(),
                body: text.to_string(),
                derived: true,
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
        project: lookup(&pairs, "project").map(str::to_string),
        pr: lookup(&pairs, "pr").map(str::to_string),
        created: lookup(&pairs, "created").map(str::to_string),
        updated: lookup(&pairs, "updated").map(str::to_string),
    };
    Plan {
        meta,
        frontmatter: pairs,
        body: body.to_string(),
        derived: false,
    }
}

/// Writes a plan back out. The body is reproduced byte for byte, and
/// frontmatter keys this build does not understand are preserved in place.
pub fn serialize(plan: &Plan) -> String {
    let mut pairs = plan.frontmatter.clone();
    let mut set = |key: &str, value: &str| match pairs.iter_mut().find(|(k, _)| k == key) {
        Some((_, v)) => *v = value.to_string(),
        None => pairs.push((key.to_string(), value.to_string())),
    };
    set("id", &plan.meta.id);
    set("title", &plan.meta.title);
    set("status", plan.meta.status.as_str());
    if let Some(plan_type) = &plan.meta.plan_type {
        set("type", plan_type);
    }
    set("source", &plan.meta.source);
    if let Some(project) = &plan.meta.project {
        set("project", project);
    }
    if let Some(pr) = &plan.meta.pr {
        set("pr", pr);
    }
    if let Some(created) = &plan.meta.created {
        set("created", created);
    }
    if let Some(updated) = &plan.meta.updated {
        set("updated", updated);
    }
    if plan.meta.pr.is_none() {
        // Reopening a plan takes its PR with it; a stale link would send
        // someone to work that was already merged or closed.
        pairs.retain(|(k, _)| k != "pr");
    }

    let mut out = String::from("---\n");
    for (key, value) in &pairs {
        out.push_str(key);
        out.push_str(": ");
        out.push_str(value);
        out.push('\n');
    }
    out.push_str("---\n");
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
        assert_eq!(plan.meta.project.as_deref(), Some("github.com/acme/api"));
        assert_eq!(plan.meta.pr.as_deref(), Some("https://github.com/acme/api/pull/4"));
        assert_eq!(plan.body, "# Body\n");
        assert!(!plan.derived);
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
            ("archived", Status::Completed),
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
    fn an_archived_tag_from_before_0_2_reads_as_completed_and_the_line_is_kept() {
        let plan = parse_str("---\ntitle: X\ntags: infra, archived\nsource: claude-code\n---\n# X\n");

        assert_eq!(plan.meta.status, Status::Completed);
        let out = serialize(&plan);
        assert!(out.contains("tags: infra, archived\n"), "the line is not this build's to remove: {out}");
        assert!(out.contains("status: completed\n"), "{out}");
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
    fn status_type_and_pr_round_trip() {
        let mut plan = parse_str("---\ntitle: X\n---\n# X\n");
        plan.meta.status = Status::InReview;
        plan.meta.plan_type = Some("bug".into());
        plan.meta.pr = Some("https://github.com/acme/api/pull/9".into());

        let back = parse_str(&serialize(&plan));

        assert_eq!(back.meta.status, Status::InReview);
        assert_eq!(back.meta.plan_type.as_deref(), Some("bug"));
        assert_eq!(back.meta.pr.as_deref(), Some("https://github.com/acme/api/pull/9"));
    }

    #[test]
    fn clearing_the_pr_removes_the_line() {
        let mut plan = parse_str("---\ntitle: X\npr: https://example.test/pull/1\n---\n# X\n");
        plan.meta.pr = None;

        let out = serialize(&plan);

        assert!(!out.contains("pr:"), "{out}");
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
    fn an_unterminated_fence_is_body_not_metadata() {
        let text = "---\ntitle: X\n\n# no closing fence\n";

        let plan = parse_str(text);

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
