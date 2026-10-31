//! `openplan` — the command line onto the plan base, and the MCP server
//! agents talk to. It links the same crate the app does, so what an agent
//! writes and what the app reads cannot drift.

pub mod mcp;
mod work_tools;

use openplan_core::base::Base;
use openplan_core::library;
use openplan_core::local::Event;
use openplan_core::plan::Status;
use openplan_core::repo::{self, Author};
use std::path::Path;

pub const USAGE: &str = "\
openplan — manage the plans you and your coding agents share

usage:
  openplan init              create the plan base, or say where it already is
  openplan list [status]     list plans, optionally only draft, alignment, in-progress,
                             in-review, completed, or archived
  openplan add <file>        file an existing markdown document as a plan
  openplan doctor            check the base is healthy and report what is in it
  openplan install <tool>    connect claude-code, codex, or cursor to the base
  openplan pending --client <tool> [--session <id>] [--format stop|context]
                             what the app sent that session's agent, for a hook
  openplan mcp               serve MCP over stdio (agents run this, not people)
  openplan help              this text
";

/// Everything a command needs, so tests can run against a temporary base
/// instead of the real one.
pub struct Context<'a> {
    pub base: &'a Base,
    /// Who the resulting commit is attributed to.
    pub author: Author,
    /// Supplied rather than read from the clock, so output is reproducible.
    pub now: String,
}

pub fn run(args: &[String], ctx: &Context) -> Result<String, String> {
    match args.first().map(String::as_str) {
        None | Some("help") | Some("--help") | Some("-h") => Ok(USAGE.to_string()),
        Some("init") => Ok(init(ctx)),
        Some("list") => list(ctx, args.get(1).map(String::as_str)),
        Some("add") => match args.get(1) {
            Some(path) => add(ctx, Path::new(path)),
            None => Err("Which file? Try: openplan add ./plan.md".to_string()),
        },
        Some("doctor") => Ok(doctor(ctx)),
        Some("install") => install(ctx, args.get(1).map(String::as_str), args.contains(&"--dry-run".to_string())),
        Some(other) => Err(format!("No such command: {other}\n\n{USAGE}")),
    }
}

fn init(ctx: &Context) -> String {
    // The base is created by resolving it, so init only has to report.
    format!("Plan base ready at {}", ctx.base.root.display())
}

fn list(ctx: &Context, status: Option<&str>) -> Result<String, String> {
    let mut entries = library::scan(ctx.base);
    if let Some(wanted) = status {
        let Some(wanted) = Status::parse(wanted) else {
            return Err(format!(
                "No such status: {wanted}. Try draft, alignment, in-progress, in-review, completed, or archived."
            ));
        };
        entries.retain(|e| e.meta.status == wanted);
        if entries.is_empty() {
            return Ok(format!("No plans are {}.", wanted.as_str()));
        }
    }
    if entries.is_empty() {
        return Ok("No plans yet.".to_string());
    }
    entries.sort_by(|a, b| b.meta.updated.cmp(&a.meta.updated));
    Ok(entries
        .iter()
        .map(|e| {
            format!(
                "[{}] {}  ({})",
                e.meta.status.as_str(),
                e.meta.title,
                e.relative_path.display()
            )
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

/// Files an existing document or plan set. Importing copies; the original
/// stays where it is.
fn add(ctx: &Context, source_path: &Path) -> Result<String, String> {
    match openplan_core::import::import_path(
        ctx.base,
        &ctx.author,
        "import",
        source_path,
        &ctx.now,
    )? {
        openplan_core::import::Outcome::Filed { id, documents } if documents > 1 => {
            Ok(format!("Filed {documents} documents as {id}"))
        }
        openplan_core::import::Outcome::Filed { id, .. } => Ok(format!("Filed as {id}")),
        openplan_core::import::Outcome::AlreadyThere { id } => Err(format!(
            "There is already a plan called {id}. Rename it, or edit that one."
        )),
    }
}

fn install(ctx: &Context, tool: Option<&str>, dry_run: bool) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Couldn't find your home directory.")?;
    let cli = std::env::current_exe().map_err(|e| e.to_string())?;
    let steps = match tool {
        Some("claude-code") => openplan_core::integrations::install_claude_code(&home, &cli, dry_run)?,
        Some("codex") => openplan_core::integrations::install_codex(&home, &cli)?,
        Some("cursor") => openplan_core::integrations::install_cursor(&home, &cli)?,
        Some(other) => return Err(format!("No such tool: {other}. Try claude-code, codex, or cursor.")),
        None => return Err("Which tool? Try: openplan install claude-code".to_string()),
    };
    let _ = ctx; // installs touch the tool's files, not the base
    Ok(steps
        .iter()
        .map(|s| format!("{}  {} ({})", if s.done { "ok" } else { "!!" }, s.label, s.detail))
        .collect::<Vec<_>>()
        .join("\n"))
}

/// What `openplan pending` prints, or nothing. It runs from hooks on every
/// turn, so it never touches the base: it asks the app once and returns.
/// `hook_input` is what the harness wrote on stdin, if anything.
pub fn pending(args: &[String], hook_input: &str) -> Option<String> {
    let flag = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .map(String::as_str)
    };
    let client = flag("--client")?;
    let format = flag("--format").unwrap_or("context");
    let events = openplan_core::local::pending(client, flag("--session"));
    pending_output(&events, client, format, hook_input)
}

/// One line per event, in the shape the hook's event reads. For a stop
/// hook that is JSON that keeps the agent going, unless a stop hook already
/// kept it going this turn, which would otherwise loop.
pub fn pending_output(events: &[Event], client: &str, format: &str, hook_input: &str) -> Option<String> {
    if events.is_empty() {
        return None;
    }
    let text = events.iter().map(pending_line).collect::<Vec<_>>().join("\n");
    if format != "stop" {
        return Some(text);
    }
    let input: serde_json::Value = serde_json::from_str(hook_input).unwrap_or_default();
    let continuing = input["stop_hook_active"] == true
        || input["loop_count"].as_u64().is_some_and(|n| n > 0);
    if continuing {
        return None;
    }
    let output = if client == "cursor" {
        serde_json::json!({ "followup_message": text })
    } else {
        serde_json::json!({ "decision": "block", "reason": text })
    };
    Some(output.to_string())
}

fn pending_line(event: &Event) -> String {
    match event {
        Event::Comments { plan, threads } => format!(
            "OpenPlan: a review with {} comment{} arrived on {plan}. Call get_comments.",
            threads.len(),
            if threads.len() == 1 { "" } else { "s" }
        ),
        Event::Align { plan } => format!(
            "OpenPlan: the plan {plan} is in alignment. Ask your questions and call record_alignment."
        ),
        Event::Status { plan, status } => format!("OpenPlan: {plan} is now {status}."),
    }
}

fn doctor(ctx: &Context) -> String {
    let entries = library::scan(ctx.base);
    let mut lines = vec![
        format!("base       {}", ctx.base.root.display()),
        format!("you        {} <{}>", ctx.author.name, ctx.author.email),
        format!(
            "history    {}",
            if repo::has_commits(&ctx.base.root) {
                "recording"
            } else {
                "not started yet"
            }
        ),
        format!("plans      {}", entries.len()),
    ];
    for status in Status::ALL {
        let n = entries.iter().filter(|e| e.meta.status == status).count();
        if n > 0 {
            lines.push(format!("  {:12} {n}", status.as_str()));
        }
    }
    if let (Some(home), Ok(cli)) = (dirs::home_dir(), std::env::current_exe()) {
        let hooks: Vec<String> = openplan_core::integrations::hooks_installed(&home, &cli)
            .iter()
            .map(|(tool, present)| format!("{tool} {}", if *present { "installed" } else { "missing" }))
            .collect();
        lines.push(format!("hooks      {}", hooks.join(", ")));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use openplan_core::base::ensure_base;

    fn temp_base(name: &str) -> Base {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        let base = ensure_base(&dir).unwrap();
        repo::init(&base.root).unwrap();
        base
    }

    fn ctx(base: &Base) -> Context<'_> {
        Context {
            base,
            author: Author::user(),
            now: "2026-08-15T12:00:00Z".to_string(),
        }
    }

    fn run_str(args: &[&str], ctx: &Context) -> Result<String, String> {
        let owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        run(&owned, ctx)
    }

    #[test]
    fn with_no_arguments_it_explains_itself() {
        let base = temp_base("openplan-cli-usage");

        assert!(run_str(&[], &ctx(&base)).unwrap().contains("openplan add"));

        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn an_unknown_command_says_so_and_shows_what_there_is() {
        let base = temp_base("openplan-cli-unknown");

        let err = run_str(&["frobnicate"], &ctx(&base)).unwrap_err();

        assert!(err.contains("No such command: frobnicate"));
        assert!(err.contains("openplan list"));
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn listing_an_empty_base_says_so_rather_than_printing_nothing() {
        let base = temp_base("openplan-cli-empty");

        assert_eq!(run_str(&["list"], &ctx(&base)).unwrap(), "No plans yet.");

        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn adding_a_document_files_it_with_the_metadata_the_app_reads() {
        let base = temp_base("openplan-cli-add");
        let loose = base.root.parent().unwrap().join("openplan-cli-add-source.md");
        std::fs::write(&loose, "# Auth refactor\n\nthe body\n").unwrap();

        let out = run_str(&["add", loose.to_str().unwrap()], &ctx(&base)).unwrap();

        assert!(out.contains("auth-refactor"), "{out}");
        let filed = std::fs::read_to_string(base.plans_dir().join("auth-refactor.md")).unwrap();
        assert!(filed.contains("title: Auth refactor"));
        assert!(filed.contains("source: import"));
        assert!(filed.ends_with("# Auth refactor\n\nthe body\n"), "body changed");
        let _ = std::fs::remove_file(&loose);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn filing_a_document_records_it_in_the_history() {
        let base = temp_base("openplan-cli-add-history");
        let loose = base.root.parent().unwrap().join("openplan-cli-hist-source.md");
        std::fs::write(&loose, "# Auth refactor\n\nbody\n").unwrap();

        run_str(&["add", loose.to_str().unwrap()], &ctx(&base)).unwrap();

        let revisions =
            repo::history(&base.root, Path::new("plans/auth-refactor.md")).unwrap();
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].message, "add: auth-refactor");
        let _ = std::fs::remove_file(&loose);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_folder_of_documents_is_filed_as_one_plan_keeping_its_documents() {
        let base = temp_base("openplan-cli-add-set");
        let src = base.root.parent().unwrap().join("openplan-cli-set-source");
        let _ = std::fs::remove_dir_all(&src);
        std::fs::create_dir_all(src.join("archive")).unwrap();
        std::fs::write(src.join("README.md"), "# React 17 to 19\n\nthe strategy\n").unwrap();
        std::fs::write(src.join("01-current-state.md"), "# Current state\n").unwrap();
        std::fs::write(src.join("archive/old.md"), "# Superseded\n").unwrap();

        let out = run_str(&["add", src.to_str().unwrap()], &ctx(&base)).unwrap();

        assert!(out.contains("3 documents"), "{out}");
        let filed = base.plans_dir().join("react-17-to-19");
        assert!(filed.join("01-current-state.md").is_file());
        assert!(filed.join("archive/old.md").is_file(), "the archive came too");
        // Listed once, not three times.
        assert_eq!(library::scan(&base).len(), 1);
        let _ = std::fs::remove_dir_all(&src);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn an_imported_plan_keeps_the_date_the_document_was_written() {
        let base = temp_base("openplan-cli-add-dates");
        let loose = base.root.parent().unwrap().join("openplan-cli-dates-source.md");
        std::fs::write(&loose, "# Auth refactor\n").unwrap();

        run_str(&["add", loose.to_str().unwrap()], &ctx(&base)).unwrap();

        let filed = std::fs::read_to_string(base.plans_dir().join("auth-refactor.md")).unwrap();
        // Not the import's clock, which the context fixes at noon.
        assert!(!filed.contains("2026-08-15T12:00:00Z"), "{filed}");
        assert!(filed.contains("updated: 20"), "{filed}");
        let _ = std::fs::remove_file(&loose);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn importing_copies_and_leaves_the_original_where_it_was() {
        let base = temp_base("openplan-cli-add-copies");
        let loose = base.root.parent().unwrap().join("openplan-cli-copy-source.md");
        std::fs::write(&loose, "# Auth refactor\n\nbody\n").unwrap();

        run_str(&["add", loose.to_str().unwrap()], &ctx(&base)).unwrap();

        assert!(loose.is_file(), "the original was moved rather than copied");
        assert_eq!(std::fs::read_to_string(&loose).unwrap(), "# Auth refactor\n\nbody\n");
        let _ = std::fs::remove_file(&loose);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_folder_with_no_entry_point_says_what_is_missing() {
        let base = temp_base("openplan-cli-add-no-readme");
        let src = base.root.parent().unwrap().join("openplan-cli-noreadme-source");
        let _ = std::fs::remove_dir_all(&src);
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("a.md"), "# A\n").unwrap();

        let err = run_str(&["add", src.to_str().unwrap()], &ctx(&base)).unwrap_err();

        assert!(err.contains("README.md"), "{err}");
        let _ = std::fs::remove_dir_all(&src);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn filing_the_same_title_twice_refuses_rather_than_overwriting() {
        let base = temp_base("openplan-cli-add-twice");
        let loose = base.root.parent().unwrap().join("openplan-cli-twice-source.md");
        std::fs::write(&loose, "# Auth refactor\n\nbody\n").unwrap();
        run_str(&["add", loose.to_str().unwrap()], &ctx(&base)).unwrap();

        let err = run_str(&["add", loose.to_str().unwrap()], &ctx(&base)).unwrap_err();

        assert!(err.contains("already a plan"), "{err}");
        let _ = std::fs::remove_file(&loose);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn listing_can_be_narrowed_to_one_status() {
        let base = temp_base("openplan-cli-list-status");
        std::fs::write(
            base.plans_dir().join("a.md"),
            "---\ntitle: Alpha\nstatus: in-review\n---\n# Alpha\n",
        )
        .unwrap();
        std::fs::write(base.plans_dir().join("b.md"), "---\ntitle: Beta\n---\n# Beta\n")
            .unwrap();

        let out = run_str(&["list", "in-review"], &ctx(&base)).unwrap();

        assert!(out.contains("[in-review] Alpha"), "{out}");
        assert!(!out.contains("Beta"), "{out}");

        let err = run_str(&["list", "blocked"], &ctx(&base)).unwrap_err();
        assert!(err.contains("No such status"), "{err}");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn doctor_reports_where_the_base_is_and_what_is_in_it() {
        let base = temp_base("openplan-cli-doctor");
        std::fs::write(
            base.plans_dir().join("a.md"),
            "---\ntitle: Alpha\nstatus: in-progress\n---\n# Alpha\n",
        )
        .unwrap();

        let out = run_str(&["doctor"], &ctx(&base)).unwrap();

        assert!(out.contains(&base.root.display().to_string()));
        assert!(out.contains("plans      1"));
        assert!(out.contains("you        user <user@openplan.local>"));
        assert!(out.contains("in-progress  1"), "{out}");
        assert!(out.contains("hooks      claude-code "), "{out}");
        assert!(out.contains(", cursor "), "{out}");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    fn review(plan: &str, comments: usize) -> Event {
        let note = openplan_core::local::CommentNote {
            id: "t1".to_string(),
            quote: "why".to_string(),
            line_start: 1,
            line_end: 1,
            text: "explain".to_string(),
            author: "Sid".to_string(),
        };
        Event::Comments {
            plan: plan.to_string(),
            threads: vec![note; comments],
        }
    }

    fn align(plan: &str) -> Event {
        Event::Align {
            plan: plan.to_string(),
        }
    }

    #[test]
    fn pending_prints_plain_lines_for_a_prompt_hook() {
        let out = pending_output(&[review("auth", 2), align("sync")], "claude-code", "context", "")
            .unwrap();

        assert_eq!(
            out,
            "OpenPlan: a review with 2 comments arrived on auth. Call get_comments.\n\
             OpenPlan: the plan sync is in alignment. Ask your questions and call record_alignment."
        );
        assert_eq!(
            pending_output(&[review("auth", 1)], "claude-code", "context", "").unwrap(),
            "OpenPlan: a review with 1 comment arrived on auth. Call get_comments."
        );
    }

    #[test]
    fn pending_keeps_a_claude_code_session_going_from_a_stop_hook() {
        let input = r#"{"session_id":"abc","hook_event_name":"Stop","stop_hook_active":false}"#;

        let out = pending_output(&[align("sync")], "claude-code", "stop", input).unwrap();

        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["decision"], "block");
        assert_eq!(
            parsed["reason"],
            "OpenPlan: the plan sync is in alignment. Ask your questions and call record_alignment."
        );
    }

    #[test]
    fn pending_hands_cursor_a_follow_up_message() {
        let out = pending_output(&[review("auth", 3)], "cursor", "stop", r#"{"loop_count":0}"#)
            .unwrap();

        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            parsed["followup_message"],
            "OpenPlan: a review with 3 comments arrived on auth. Call get_comments."
        );
    }

    #[test]
    fn pending_says_nothing_when_nothing_waits_or_a_stop_hook_already_fired() {
        assert_eq!(pending_output(&[], "claude-code", "stop", ""), None);
        assert_eq!(pending_output(&[], "claude-code", "context", ""), None);
        let again = r#"{"stop_hook_active":true}"#;
        assert_eq!(pending_output(&[align("sync")], "claude-code", "stop", again), None);
        assert_eq!(pending_output(&[align("sync")], "cursor", "stop", r#"{"loop_count":1}"#), None);
    }

    #[test]
    fn pending_with_no_client_or_no_app_prints_nothing() {
        assert_eq!(pending(&["pending".to_string()], ""), None);
    }
}
