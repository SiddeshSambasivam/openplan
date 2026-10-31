//! Disk writes that cannot leave a half-written file behind.

use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

/// Counts writes so no two of them name the same temp file. Two writers to
/// one file that shared a name would leave the second rename with nothing to
/// rename, and the process id keeps a second OpenPlan out of it too.
static WRITES: AtomicU64 = AtomicU64::new(0);

/// Turns an io error into something worth showing a person.
pub fn friendly_write_error(e: &std::io::Error) -> String {
    match e.kind() {
        std::io::ErrorKind::NotFound => {
            "The file's folder no longer exists at this location.".to_string()
        }
        std::io::ErrorKind::PermissionDenied => {
            "OpenPlan doesn't have permission to write this file.".to_string()
        }
        std::io::ErrorKind::StorageFull => "The disk is full.".to_string(),
        _ => e.to_string(),
    }
}

pub fn friendly_read_error(e: &std::io::Error) -> String {
    match e.kind() {
        std::io::ErrorKind::NotFound => {
            "The file no longer exists at this location.".to_string()
        }
        std::io::ErrorKind::PermissionDenied => {
            "OpenPlan doesn't have permission to read this file.".to_string()
        }
        std::io::ErrorKind::InvalidData => "This file isn't valid UTF-8 text.".to_string(),
        _ => e.to_string(),
    }
}

/// Write `contents` to `target` via a temp file in the same directory, renamed
/// over the target — so a crash mid-write cannot corrupt what was already there.
/// A symlink is written through, so the link survives.
pub fn atomic_write(target: &Path, contents: &str) -> Result<(), String> {
    let target = &link_target(target);
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "Invalid file path.".to_string())?;
    let file_name = target
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid file name.".to_string())?;
    let tmp = dir.join(format!(
        ".{file_name}.{}-{}.openplan-tmp",
        std::process::id(),
        WRITES.fetch_add(1, Ordering::Relaxed)
    ));

    let result = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(contents.as_bytes())?;
        f.sync_all()?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = std::fs::remove_file(&tmp);
        return Err(friendly_write_error(&e));
    }
    std::fs::rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        friendly_write_error(&e)
    })
}

pub fn read_to_string(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| friendly_read_error(&e))
}

/// The file a symlink points at, or the path itself. Renaming over a link
/// would replace the link with a plain file, as people keep their agent
/// instructions in a dotfiles repo behind one.
fn link_target(path: &Path) -> std::path::PathBuf {
    let is_link = std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink());
    match is_link {
        true => std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf()),
        false => path.to_path_buf(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        // Named per process: every checkout on this machine shares one
        // temp directory, and a fixed name lets one run wipe another's.
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_then_reads_back_the_same_text() {
        let dir = temp_dir("openplan-core-write");
        let path = dir.join("doc.md");

        atomic_write(&path, "# hello\n\nworld").unwrap();

        assert_eq!(read_to_string(&path).unwrap(), "# hello\n\nworld");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn overwrites_an_existing_file_without_leaving_a_temp_behind() {
        let dir = temp_dir("openplan-core-overwrite");
        let path = dir.join("doc.md");

        atomic_write(&path, "first").unwrap();
        atomic_write(&path, "# v2 with unicode — ✓").unwrap();

        assert_eq!(read_to_string(&path).unwrap(), "# v2 with unicode — ✓");
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains("tmp"))
            .collect();
        assert!(leftovers.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn writes_through_a_symlink_and_keeps_the_link() {
        let dir = temp_dir("openplan-core-symlink");
        let real = dir.join("dotfiles-CLAUDE.md");
        let link = dir.join("CLAUDE.md");
        std::fs::write(&real, "theirs").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        atomic_write(&link, "theirs, then ours").unwrap();

        assert!(std::fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(read_to_string(&real).unwrap(), "theirs, then ours");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn writers_working_at_once_do_not_share_a_temp_file() {
        let dir = temp_dir("openplan-core-write-at-once");
        let path = dir.join("doc.md");

        let failures: Vec<String> = std::thread::scope(|scope| {
            let started: Vec<_> = (0..8)
                .map(|_| scope.spawn(|| atomic_write(&path, "same text")))
                .collect();
            started
                .into_iter()
                .filter_map(|handle| handle.join().unwrap().err())
                .collect()
        });

        assert!(failures.is_empty(), "{failures:?}");
        assert_eq!(read_to_string(&path).unwrap(), "same text");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn explains_a_write_into_a_missing_directory() {
        let dir = temp_dir("openplan-core-missing");

        let err = atomic_write(&dir.join("no-such-dir").join("x.md"), "x").unwrap_err();

        assert!(err.contains("folder no longer exists"), "got: {err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn explains_a_read_of_a_missing_file() {
        let dir = temp_dir("openplan-core-missing-read");

        let err = read_to_string(&dir.join("nope.md")).unwrap_err();

        assert!(err.contains("no longer exists"), "got: {err}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
