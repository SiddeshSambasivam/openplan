//! Filing existing documents into the base. Importing always copies — what
//! someone already keeps stays exactly where they keep it — and always
//! records who filed what.

use crate::base::Base;
use crate::library;
use crate::plan::{self, slugify, Plan, PlanMeta};
use crate::repo::{self, Author};
use crate::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// What became of one import.
#[derive(Debug, PartialEq)]
pub enum Outcome {
    /// Filed under this id, holding this many documents.
    Filed { id: String, documents: usize },
    /// A plan with this id is already in the base; nothing was written.
    AlreadyThere { id: String },
}

/// When a document was last written. Imports carry the plan's own dates, not
/// the moment the import ran.
fn modified_iso(path: &Path) -> Option<String> {
    let secs = std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    Some(iso_from_unix(secs))
}

/// Days-from-civil, inverted — exact for every date a file can carry.
pub fn iso_from_unix(secs: i64) -> String {
    let (days, time) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        time / 3600,
        (time % 3600) / 60,
        time % 60
    )
}

fn copy_tree(from: &Path, to: &Path) -> Result<usize, String> {
    std::fs::create_dir_all(to).map_err(|e| format!("Couldn't create {}: {e}", to.display()))?;
    let entries = std::fs::read_dir(from)
        .map_err(|e| format!("Couldn't read {}: {e}", from.display()))?;
    let mut copied = 0;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let (src, dst) = (entry.path(), to.join(&name));
        match entry.file_type() {
            Ok(t) if t.is_dir() => copied += copy_tree(&src, &dst)?,
            Ok(t) if t.is_file() => {
                std::fs::copy(&src, &dst)
                    .map_err(|e| format!("Couldn't copy {}: {e}", src.display()))?;
                copied += 1;
            }
            _ => {}
        }
    }
    Ok(copied)
}

fn stamp(parsed: Plan, id: &str, source: &str, origin: &Path, now: &str) -> Plan {
    Plan {
        meta: PlanMeta {
            id: id.to_string(),
            source: if parsed.derived {
                source.to_string()
            } else {
                parsed.meta.source.clone()
            },
            created: parsed.meta.created.clone().or_else(|| modified_iso(origin)),
            updated: modified_iso(origin).or_else(|| Some(now.to_string())),
            ..parsed.meta.clone()
        },
        ..parsed
    }
}

/// Files one path — a document, or a set (a folder with an entry point) — as
/// one plan. `source` is what a plan that names no source of its own is
/// recorded as: "import" for a folder someone points at, an agent's name for
/// plans that agent wrote.
pub fn import_path(
    base: &Base,
    author: &Author,
    source: &str,
    path: &Path,
    now: &str,
) -> Result<Outcome, String> {
    if path.is_dir() {
        let Some(entry) = library::set_entry(path) else {
            return Err(format!(
                "{} has no README.md and nothing numbered 00-, so there is no way \
                 to tell what the plan is called.",
                path.display()
            ));
        };
        let text = fs::read_to_string(&entry)?;
        let id = slugify(&plan::parse(&text, &entry).meta.title);
        let destination = base.plans_dir().join(&id);
        if destination.exists() {
            return Ok(Outcome::AlreadyThere { id });
        }
        let documents = copy_tree(path, &destination)?;
        let filed_entry = destination.join(entry.file_name().unwrap());
        let parsed = plan::parse(&fs::read_to_string(&filed_entry)?, &filed_entry);
        let stamped = stamp(parsed, &id, source, &entry, now);
        fs::atomic_write(&filed_entry, &plan::serialize(&stamped))?;
        repo::commit_all(&base.root, author, &format!("add: {id}"))?;
        return Ok(Outcome::Filed { id, documents });
    }

    let text = fs::read_to_string(path)?;
    let parsed = plan::parse(&text, path);
    let id = slugify(&parsed.meta.title);
    let destination = base.plans_dir().join(format!("{id}.md"));
    if destination.exists() {
        return Ok(Outcome::AlreadyThere { id });
    }
    let stamped = stamp(parsed, &id, source, path, now);
    fs::atomic_write(&destination, &plan::serialize(&stamped))?;
    repo::commit_all(&base.root, author, &format!("add: {id}"))?;
    Ok(Outcome::Filed { id, documents: 1 })
}

/// Files everything inside a folder of plans: each markdown file becomes a
/// plan, each subfolder with an entry point becomes a set. A folder that is
/// itself a set (it has an entry point) files as one plan. Subfolders that
/// are neither are left alone rather than guessed at.
pub fn import_folder(
    base: &Base,
    author: &Author,
    source: &str,
    dir: &Path,
    now: &str,
) -> Result<Vec<Outcome>, String> {
    if library::set_entry(dir).is_some() {
        return Ok(vec![import_path(base, author, source, dir, now)?]);
    }
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Couldn't read {}: {e}", dir.display()))?;
    let mut sorted: Vec<_> = entries.flatten().collect();
    sorted.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());

    let mut outcomes = Vec::new();
    for entry in sorted {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        let importable = match entry.file_type() {
            Ok(t) if t.is_file() => library::is_markdown(&path),
            Ok(t) if t.is_dir() => library::set_entry(&path).is_some(),
            _ => false,
        };
        if importable {
            outcomes.push(import_path(base, author, source, &path, now)?);
        }
    }
    Ok(outcomes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::base::ensure_base;

    fn temp_base(name: &str) -> Base {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        let base = ensure_base(&dir).unwrap();
        repo::init(&base.root).unwrap();
        base
    }

    const NOW: &str = "2026-08-16T09:00:00Z";

    #[test]
    fn importing_the_same_thing_twice_reports_it_rather_than_failing() {
        let base = temp_base("openplan-core-import-twice");
        let loose = base.root.parent().unwrap().join("openplan-core-import-src.md");
        std::fs::write(&loose, "# Auth refactor\n").unwrap();

        let first = import_path(&base, &Author::user(), "import", &loose, NOW).unwrap();
        let second = import_path(&base, &Author::user(), "import", &loose, NOW).unwrap();

        assert!(matches!(first, Outcome::Filed { .. }));
        assert_eq!(second, Outcome::AlreadyThere { id: "auth-refactor".into() });
        let _ = std::fs::remove_file(&loose);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_folder_of_plans_files_each_of_them_not_the_folder() {
        let base = temp_base("openplan-core-import-folder");
        let src = base.root.parent().unwrap().join("openplan-core-import-folder-src");
        let _ = std::fs::remove_dir_all(&src);
        std::fs::create_dir_all(src.join("react-migration")).unwrap();
        std::fs::create_dir_all(src.join("scratch")).unwrap();
        std::fs::write(src.join("status-page.md"), "# Status page\n").unwrap();
        std::fs::write(src.join("react-migration/README.md"), "# React migration\n").unwrap();
        std::fs::write(src.join("react-migration/01-a.md"), "# A\n").unwrap();
        std::fs::write(src.join("scratch/notes.txt"), "not a plan").unwrap();

        let outcomes = import_folder(&base, &Author::user(), "import", &src, NOW).unwrap();

        assert_eq!(outcomes.len(), 2, "{outcomes:?}");
        let listed = crate::library::scan(&base);
        let titles: Vec<&str> = listed.iter().map(|e| e.meta.title.as_str()).collect();
        assert!(titles.contains(&"Status page"), "{titles:?}");
        assert!(titles.contains(&"React migration"), "{titles:?}");
        let set = listed.iter().find(|e| e.meta.title == "React migration").unwrap();
        assert_eq!(set.documents.len(), 2, "the set kept its documents");
        let _ = std::fs::remove_dir_all(&src);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_folder_that_is_itself_a_set_files_as_one_plan() {
        let base = temp_base("openplan-core-import-folder-set");
        let src = base.root.parent().unwrap().join("openplan-core-import-selfset");
        let _ = std::fs::remove_dir_all(&src);
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("README.md"), "# One big plan\n").unwrap();
        std::fs::write(src.join("01-a.md"), "# A\n").unwrap();

        let outcomes = import_folder(&base, &Author::user(), "import", &src, NOW).unwrap();

        assert_eq!(outcomes.len(), 1);
        assert!(matches!(&outcomes[0], Outcome::Filed { documents, .. } if *documents == 2));
        let _ = std::fs::remove_dir_all(&src);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_plan_an_agent_wrote_is_recorded_as_that_agent() {
        let base = temp_base("openplan-core-import-agent");
        let loose = base.root.parent().unwrap().join("openplan-core-import-agent.md");
        std::fs::write(&loose, "# From a session\n").unwrap();

        import_path(&base, &Author::agent("claude-code"), "claude-code", &loose, NOW).unwrap();

        let filed =
            std::fs::read_to_string(base.plans_dir().join("from-a-session.md")).unwrap();
        assert!(filed.contains("source: claude-code"), "{filed}");
        let history = repo::history(&base.root, Path::new("plans/from-a-session.md")).unwrap();
        assert_eq!(history[0].author, "claude-code");
        let _ = std::fs::remove_file(&loose);
        let _ = std::fs::remove_dir_all(&base.root);
    }
}
