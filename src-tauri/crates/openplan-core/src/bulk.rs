//! What the person does to several plans at once. Each call is one commit,
//! so a bulk change reads as one step in the base's history.

use crate::base::Base;
use crate::plan::{self, Status};
use crate::repo::{self, Author};
use crate::{fs, library, sidecar, work};
use std::path::{Component, Path, PathBuf};

/// "1 plan" or "3 plans".
pub fn counted(count: usize) -> String {
    format!("{count} {}", if count == 1 { "plan" } else { "plans" })
}

/// Writes `status` to every plan and commits once.
pub fn set_statuses(
    base: &Base,
    author: &Author,
    paths: &[impl AsRef<Path>],
    status: Status,
    now: &str,
) -> Result<(), String> {
    for path in paths.iter().map(AsRef::as_ref) {
        let mut parsed = plan::parse(&fs::read_to_string(path)?, path);
        parsed.meta.set_status(status, now);
        fs::atomic_write(path, &plan::serialize(&parsed))?;
    }
    let change = match status {
        Status::Archived => format!("archive {}", counted(paths.len())),
        other => format!("set {} to {}", counted(paths.len()), other.as_str()),
    };
    repo::commit_all(&base.root, author, &format!("edit: {change}"))?;
    Ok(())
}

/// Removes every plan, its sidecars included, and commits once. A plan set
/// goes as a whole folder. A path that is not a plan inside the base is
/// refused before anything is removed.
pub fn delete_plans(
    base: &Base,
    author: &Author,
    paths: &[impl AsRef<Path>],
) -> Result<(), String> {
    let paths: Vec<&Path> = paths.iter().map(AsRef::as_ref).collect();
    if let Some(stray) = paths.iter().find(|path| !is_plan_in(base, path)) {
        return Err(format!("{} isn't a plan in the plan base.", stray.display()));
    }
    for path in &paths {
        match set_folder(base, path) {
            Some(folder) => removed(&folder, std::fs::remove_dir_all(&folder))?,
            None => {
                removed(path, std::fs::remove_file(path))?;
                sidecar::delete_comments(path)?;
                let record = work::work_path(path)?;
                removed(&record, std::fs::remove_file(&record))?;
            }
        }
    }
    repo::commit_all(&base.root, author, &format!("delete: {}", counted(paths.len())))?;
    Ok(())
}

/// A visible plan document under the base root. Hidden entries hold git and
/// the sidecars, and `..` could climb out.
fn is_plan_in(base: &Base, path: &Path) -> bool {
    let Ok(inside) = path.strip_prefix(&base.root) else {
        return false;
    };
    let visible = inside.components().all(|part| match part {
        Component::Normal(name) => !name.to_string_lossy().starts_with('.'),
        _ => false,
    });
    visible && library::is_plan(path)
}

/// The folder a set's entry document stands for. The base root is never a
/// set: a README there is one plan.
fn set_folder(base: &Base, path: &Path) -> Option<PathBuf> {
    let folder = path.parent().filter(|folder| *folder != base.root)?;
    (library::set_entry(folder)? == path).then(|| folder.to_path_buf())
}

/// Something already gone is not an error: the plan is deleted either way.
fn removed(path: &Path, result: std::io::Result<()>) -> Result<(), String> {
    match result {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Couldn't delete {}: {e}", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::base::ensure_base;
    use crate::{plan, repo, sidecar, work};
    use std::path::PathBuf;

    fn temp_base(name: &str) -> Base {
        // Named per process: every checkout on this machine shares one temp
        // directory, and a fixed name lets one run wipe another's.
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let base = ensure_base(&dir).unwrap();
        repo::init(&base.root).unwrap();
        base
    }

    fn write(base: &Base, rel: &str, text: &str) -> PathBuf {
        let path = base.root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, text).unwrap();
        path
    }

    fn draft(title: &str) -> String {
        format!("---\ntitle: {title}\nstatus: draft\n---\n# {title}\n")
    }

    fn head(base: &Base) -> (String, String, usize) {
        let git = git2::Repository::open(&base.root).unwrap();
        let head = git.head().unwrap().peel_to_commit().unwrap();
        let author = head.author().name().unwrap().to_string();
        (head.message().unwrap().to_string(), author, head.parent_count())
    }

    fn in_head(base: &Base, rel: &str) -> bool {
        let git = git2::Repository::open(&base.root).unwrap();
        let tree = git.head().unwrap().peel_to_tree().unwrap();
        let found = tree.get_path(Path::new(rel)).is_ok();
        found
    }

    fn commits(base: &Base) -> usize {
        let git = git2::Repository::open(&base.root).unwrap();
        let mut walk = git.revwalk().unwrap();
        walk.push_head().unwrap();
        walk.count()
    }

    #[test]
    fn counts_plans_in_english() {
        assert_eq!(counted(1), "1 plan");
        assert_eq!(counted(3), "3 plans");
    }

    #[test]
    fn archiving_several_plans_is_one_commit_by_the_person() {
        let base = temp_base("openplan-core-bulk-archive");
        let one = write(&base, "plans/one.md", &draft("One"));
        let two = write(&base, "plans/set/README.md", &draft("Two"));
        let three = write(&base, "plans/three.md", &draft("Three"));
        repo::commit_all(&base.root, &Author::user(), "init").unwrap();

        set_statuses(
            &base,
            &Author::agent("sid"),
            &[&one, &two, &three],
            Status::Archived,
            "2026-10-29T10:00:00Z",
        )
        .unwrap();

        for path in [&one, &two, &three] {
            let text = std::fs::read_to_string(path).unwrap();
            assert_eq!(plan::parse(&text, path).meta.status, Status::Archived);
        }
        assert_eq!(
            head(&base),
            ("edit: archive 3 plans".to_string(), "sid".to_string(), 1)
        );
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn archiving_one_plan_says_so_in_the_singular() {
        let base = temp_base("openplan-core-bulk-archive-one");
        let one = write(&base, "plans/one.md", &draft("One"));
        repo::commit_all(&base.root, &Author::user(), "init").unwrap();

        set_statuses(&base, &Author::user(), &[&one], Status::Archived, "now").unwrap();

        assert_eq!(head(&base).0, "edit: archive 1 plan");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn deleting_takes_the_file_its_sidecars_and_a_whole_set_in_one_commit() {
        let base = temp_base("openplan-core-bulk-delete");
        let single = write(&base, "plans/single.md", &draft("Single"));
        sidecar::write_comments(&single, "{\"version\":2,\"threads\":[]}").unwrap();
        work::write(&single, &work::WorkRecord::default()).unwrap();
        let entry = write(&base, "plans/set/README.md", &draft("Set"));
        write(&base, "plans/set/01-part.md", "# Part\n");
        let kept = write(&base, "plans/kept.md", &draft("Kept"));
        repo::commit_all(&base.root, &Author::user(), "init").unwrap();
        let before = commits(&base);

        delete_plans(&base, &Author::agent("sid"), &[&single, &entry]).unwrap();

        assert!(!single.exists());
        assert!(!sidecar::comments_path(&single).unwrap().exists());
        assert!(!work::work_path(&single).unwrap().exists());
        assert!(!base.root.join("plans/set").exists());
        assert!(kept.exists());
        assert_eq!(head(&base), ("delete: 2 plans".to_string(), "sid".to_string(), 1));
        assert_eq!(commits(&base), before + 1);
        assert!(!in_head(&base, "plans/single.md"));
        assert!(!in_head(&base, "plans/.single.md.oplan-work.json"));
        assert!(!in_head(&base, "plans/set/01-part.md"));
        assert!(in_head(&base, "plans/kept.md"));
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn deleting_one_plan_says_so_in_the_singular() {
        let base = temp_base("openplan-core-bulk-delete-one");
        let single = write(&base, "plans/single.md", &draft("Single"));
        repo::commit_all(&base.root, &Author::user(), "init").unwrap();

        delete_plans(&base, &Author::user(), &[&single]).unwrap();

        assert_eq!(head(&base).0, "delete: 1 plan");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_path_outside_the_base_is_refused_and_nothing_is_removed() {
        let base = temp_base("openplan-core-bulk-delete-outside");
        let inside = write(&base, "plans/inside.md", &draft("Inside"));
        repo::commit_all(&base.root, &Author::user(), "init").unwrap();
        let outside_dir =
            std::env::temp_dir().join(format!("openplan-core-bulk-outside-{}", std::process::id()));
        std::fs::create_dir_all(&outside_dir).unwrap();
        let outside = outside_dir.join("elsewhere.md");
        std::fs::write(&outside, draft("Elsewhere")).unwrap();
        let climbing = base.root.join("plans/../../escape.md");

        assert!(delete_plans(&base, &Author::user(), &[&inside, &outside]).is_err());
        assert!(delete_plans(&base, &Author::user(), &[&climbing]).is_err());
        assert!(delete_plans(&base, &Author::user(), &[&base.root.join(".git/HEAD")]).is_err());

        assert!(inside.exists());
        assert!(outside.exists());
        assert!(base.root.join(".git/HEAD").exists());
        let _ = std::fs::remove_dir_all(&base.root);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[test]
    fn a_readme_at_the_base_root_is_one_plan_not_the_base() {
        let base = temp_base("openplan-core-bulk-delete-root-readme");
        let readme = write(&base, "README.md", &draft("Root"));
        let kept = write(&base, "plans/kept.md", &draft("Kept"));
        repo::commit_all(&base.root, &Author::user(), "init").unwrap();

        delete_plans(&base, &Author::user(), &[&readme]).unwrap();

        assert!(!readme.exists());
        assert!(kept.exists());
        let _ = std::fs::remove_dir_all(&base.root);
    }
}
