//! `openplan` — the command line onto the plan base, and (from P2.2) the MCP
//! server agents talk to. It links the same crate the app does, so what an
//! agent writes and what the app reads cannot drift.

use openplan_core::base::Base;
use openplan_core::plan::{self, Plan, PlanMeta, Status};
use openplan_core::repo::{self, Author};
use openplan_core::{fs, library};
use std::path::Path;

pub const USAGE: &str = "\
openplan — manage the plans you and your coding agents share

usage:
  openplan init              create the plan base, or say where it already is
  openplan list [status]     list plans, optionally only one status
  openplan add <file>        file an existing markdown document as a plan
  openplan doctor            check the base is healthy and report what is in it
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
        Some(other) => Err(format!("No such command: {other}\n\n{USAGE}")),
    }
}

fn init(ctx: &Context) -> String {
    // The base is created by resolving it, so init only has to report.
    format!("Plan base ready at {}", ctx.base.root.display())
}

fn list(ctx: &Context, status_filter: Option<&str>) -> Result<String, String> {
    let wanted = match status_filter {
        Some(raw) => Some(
            Status::parse(raw)
                .ok_or_else(|| format!("No such status: {raw}"))?,
        ),
        None => None,
    };
    let mut entries = library::scan(ctx.base);
    entries.retain(|e| wanted.map_or(true, |w| e.meta.status == w));
    if entries.is_empty() {
        return Ok("No plans yet.".to_string());
    }
    entries.sort_by(|a, b| b.meta.updated.cmp(&a.meta.updated));
    let width = entries
        .iter()
        .map(|e| e.meta.status.as_str().len())
        .max()
        .unwrap_or(0);
    Ok(entries
        .iter()
        .map(|e| {
            format!(
                "{:width$}  {}  ({})",
                e.meta.status.as_str(),
                e.meta.title,
                e.relative_path.display()
            )
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

/// Files an existing document as a plan: copied in, given the frontmatter the
/// app reads, and recorded. The body is left exactly as written.
fn add(ctx: &Context, source_path: &Path) -> Result<String, String> {
    let text = fs::read_to_string(source_path)?;
    let parsed = plan::parse(&text, source_path);
    let id = plan::slugify(&parsed.meta.title);
    let destination = ctx.base.plans_dir().join(format!("{id}.md"));
    if destination.exists() {
        return Err(format!(
            "There is already a plan called {id}. Rename it, or edit that one."
        ));
    }

    let filed = Plan {
        meta: PlanMeta {
            id: id.clone(),
            source: if parsed.derived {
                "import".to_string()
            } else {
                parsed.meta.source.clone()
            },
            created: parsed.meta.created.clone().or_else(|| Some(ctx.now.clone())),
            updated: Some(ctx.now.clone()),
            ..parsed.meta.clone()
        },
        ..parsed
    };
    fs::atomic_write(&destination, &plan::serialize(&filed))?;
    repo::commit_all(
        &ctx.base.root,
        &ctx.author,
        &format!("add: {id}"),
    )?;
    Ok(format!("Filed as {}", destination.display()))
}

fn doctor(ctx: &Context) -> String {
    let entries = library::scan(ctx.base);
    let mut lines = vec![
        format!("base       {}", ctx.base.root.display()),
        format!(
            "history    {}",
            if repo::has_commits(&ctx.base.root) {
                "recording"
            } else {
                "not started — nothing has been written yet"
            }
        ),
        format!("plans      {}", entries.len()),
    ];
    if !entries.is_empty() {
        let mut counts: Vec<(Status, usize)> = Vec::new();
        for entry in &entries {
            match counts.iter_mut().find(|(s, _)| *s == entry.meta.status) {
                Some((_, n)) => *n += 1,
                None => counts.push((entry.meta.status, 1)),
            }
        }
        for (status, n) in counts {
            lines.push(format!("  {:12} {}", status.as_str(), n));
        }
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

        assert!(out.contains("auth-refactor.md"), "{out}");
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
        std::fs::write(
            base.plans_dir().join("b.md"),
            "---\ntitle: Beta\nstatus: done\n---\n# Beta\n",
        )
        .unwrap();

        let out = run_str(&["list", "in-review"], &ctx(&base)).unwrap();

        assert!(out.contains("Alpha"));
        assert!(!out.contains("Beta"), "{out}");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn an_unknown_status_is_rejected_rather_than_matching_nothing() {
        let base = temp_base("openplan-cli-list-bad-status");

        let err = run_str(&["list", "pending"], &ctx(&base)).unwrap_err();

        assert!(err.contains("No such status: pending"));
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn doctor_reports_where_the_base_is_and_what_is_in_it() {
        let base = temp_base("openplan-cli-doctor");
        std::fs::write(
            base.plans_dir().join("a.md"),
            "---\ntitle: Alpha\nstatus: in-review\n---\n# Alpha\n",
        )
        .unwrap();

        let out = run_str(&["doctor"], &ctx(&base)).unwrap();

        assert!(out.contains(&base.root.display().to_string()));
        assert!(out.contains("plans      1"));
        assert!(out.contains("in-review    1"));
        let _ = std::fs::remove_dir_all(&base.root);
    }
}
