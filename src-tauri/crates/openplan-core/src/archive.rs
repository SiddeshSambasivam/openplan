//! Completed plans are put away on their own once they have sat long enough.
//! The app asks when it opens and when the board is shown, never on a timer.

use crate::base::Base;
use crate::import::iso_from_unix;
use crate::plan::{self, PlanMeta, Status};
use crate::repo::{self, Author};
use crate::{fs, library};

/// Whether a completed plan has sat for longer than `days`. Zero days means
/// never. A plan completed before the date was kept counts from its last
/// update, and one with neither date stays where it is.
pub fn is_stale(meta: &PlanMeta, days: u32, now: i64) -> bool {
    if days == 0 || meta.status != Status::Completed {
        return false;
    }
    let Some(since) = meta.completed.as_deref().or(meta.updated.as_deref()) else {
        return false;
    };
    // Both are UTC ISO 8601 timestamps, which sort as text.
    since < iso_from_unix(now - i64::from(days) * 86_400).as_str()
}

pub fn commit_message(count: usize) -> String {
    format!("archive: {}", crate::bulk::counted(count))
}

/// Archives every stale completed plan in one commit, authored by the app.
/// Returns how many it archived.
pub fn archive_stale(base: &Base, days: u32, now: i64) -> Result<usize, String> {
    let stale: Vec<_> = library::scan(base)
        .into_iter()
        .filter(|entry| is_stale(&entry.meta, days, now))
        .collect();
    if stale.is_empty() {
        return Ok(0);
    }
    let at = iso_from_unix(now);
    for entry in &stale {
        let mut parsed = plan::parse(&fs::read_to_string(&entry.path)?, &entry.path);
        parsed.meta.set_status(Status::Archived, &at);
        fs::atomic_write(&entry.path, &plan::serialize(&parsed))?;
    }
    repo::commit_all(&base.root, &Author::app(), &commit_message(stale.len()))?;
    Ok(stale.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::base::ensure_base;
    use crate::import::iso_from_unix;
    use crate::{plan, repo};
    use std::path::{Path, PathBuf};

    const DAY: i64 = 86_400;
    /// 2026-10-29T00:00:00Z.
    const NOW: i64 = 1_793_232_000;

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

    fn completed(days_ago: i64) -> String {
        format!(
            "---\ntitle: Done\nstatus: completed\ncompleted: {}\n---\n# Done\n",
            iso_from_unix(NOW - days_ago * DAY)
        )
    }

    fn meta(text: &str) -> PlanMeta {
        plan::parse(text, Path::new("plan.md")).meta
    }

    fn status_of(path: &Path) -> Status {
        meta(&std::fs::read_to_string(path).unwrap()).status
    }

    #[test]
    fn a_plan_completed_longer_ago_than_the_setting_is_stale() {
        assert!(is_stale(&meta(&completed(8)), 7, NOW));
        assert!(!is_stale(&meta(&completed(6)), 7, NOW));
    }

    #[test]
    fn zero_days_means_never() {
        assert!(!is_stale(&meta(&completed(400)), 0, NOW));
    }

    #[test]
    fn only_completed_plans_are_put_away() {
        let in_review = completed(30).replace("status: completed", "status: in-review");
        let archived = completed(30).replace("status: completed", "status: archived");

        assert!(!is_stale(&meta(&in_review), 7, NOW));
        assert!(!is_stale(&meta(&archived), 7, NOW));
    }

    #[test]
    fn a_plan_completed_before_the_date_was_kept_counts_from_its_last_update() {
        let old = format!(
            "---\ntitle: Old\nstatus: completed\nupdated: {}\n---\n# Old\n",
            iso_from_unix(NOW - 30 * DAY)
        );
        let undated = "---\ntitle: Undated\nstatus: completed\n---\n# Undated\n";

        assert!(is_stale(&meta(&old), 7, NOW));
        assert!(!is_stale(&meta(undated), 7, NOW));
    }

    #[test]
    fn the_commit_message_counts_the_plans_in_english() {
        assert_eq!(commit_message(1), "archive: 1 plan");
        assert_eq!(commit_message(3), "archive: 3 plans");
    }

    #[test]
    fn stale_plans_are_archived_in_one_commit_by_the_app() {
        let base = temp_base("openplan-core-archive-stale");
        let old = write(&base, "plans/old.md", &completed(10));
        let older = write(&base, "plans/set/README.md", &completed(20));
        let fresh = write(&base, "plans/fresh.md", &completed(2));
        repo::commit_all(&base.root, &repo::Author::user(), "init").unwrap();

        let archived = archive_stale(&base, 7, NOW).unwrap();

        assert_eq!(archived, 2);
        assert_eq!(status_of(&old), Status::Archived);
        assert_eq!(status_of(&older), Status::Archived);
        assert_eq!(status_of(&fresh), Status::Completed);
        let git = git2::Repository::open(&base.root).unwrap();
        let head = git.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.message().ok(), Some("archive: 2 plans"));
        assert_eq!(head.author().name().ok(), Some("openplan"));
        assert_eq!(head.author().email().ok(), Some("openplan@openplan.local"));
        assert_eq!(head.parent_count(), 1, "more than one commit was written");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn nothing_stale_writes_nothing() {
        let base = temp_base("openplan-core-archive-none");
        write(&base, "plans/fresh.md", &completed(2));
        repo::commit_all(&base.root, &repo::Author::user(), "init").unwrap();

        assert_eq!(archive_stale(&base, 7, NOW).unwrap(), 0);
        assert_eq!(archive_stale(&base, 0, NOW).unwrap(), 0);

        let revisions = repo::history(&base.root, Path::new("plans/fresh.md")).unwrap();
        assert_eq!(revisions.len(), 1);
        let _ = std::fs::remove_dir_all(&base.root);
    }
}
