//! Comment threads live in a JSON sidecar beside the plan, never inside it —
//! the app only rewrites content the user asked it to touch. The leading dot
//! keeps the sidecar out of directory scans, which skip hidden entries.

use crate::fs::atomic_write;
use std::path::{Path, PathBuf};

const SIDECAR_SUFFIX: &str = "oplan-comments.json";
/// What sidecars were called before the product was renamed. Still read, and
/// retired the next time the plan's comments are saved.
const LEGACY_SIDECAR_SUFFIX: &str = "omd-comments.json";

fn sidecar_path(doc_path: &Path, suffix: &str) -> Result<PathBuf, String> {
    let dir = doc_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "Invalid file path.".to_string())?;
    let file_name = doc_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid file name.".to_string())?;
    Ok(dir.join(format!(".{file_name}.{suffix}")))
}

pub fn comments_path(doc_path: &Path) -> Result<PathBuf, String> {
    sidecar_path(doc_path, SIDECAR_SUFFIX)
}

fn legacy_comments_path(doc_path: &Path) -> Result<PathBuf, String> {
    sidecar_path(doc_path, LEGACY_SIDECAR_SUFFIX)
}

fn read_if_present(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// `None` (rather than an error) means no comments have ever been saved.
pub fn read_comments(doc_path: &Path) -> Result<Option<String>, String> {
    match read_if_present(&comments_path(doc_path)?)? {
        Some(contents) => Ok(Some(contents)),
        None => read_if_present(&legacy_comments_path(doc_path)?),
    }
}

/// Saves under the current name and retires any legacy sidecar, so a plan
/// never ends up with two files disagreeing about its comments.
pub fn write_comments(doc_path: &Path, contents: &str) -> Result<(), String> {
    atomic_write(&comments_path(doc_path)?, contents)?;
    let _ = std::fs::remove_file(legacy_comments_path(doc_path)?);
    Ok(())
}

/// Called once a plan's last thread is deleted, so an empty file doesn't
/// linger. A sidecar that was never written is not an error.
pub fn delete_comments(doc_path: &Path) -> Result<(), String> {
    for path in [comments_path(doc_path)?, legacy_comments_path(doc_path)?] {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        // Named per process: every checkout on this machine shares one
        // temp directory, and a fixed name lets one run wipe another's.
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reports_no_sidecar_as_absent_rather_than_failing() {
        let dir = temp_dir("openplan-core-sidecar-absent");

        assert_eq!(read_comments(&dir.join("notes.md")).unwrap(), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn round_trips_threads_through_a_hidden_neighbour_file() {
        let dir = temp_dir("openplan-core-sidecar-roundtrip");
        let doc = dir.join("notes.md");

        write_comments(&doc, "[{\"id\":\"1\"}]").unwrap();

        assert_eq!(
            read_comments(&doc).unwrap(),
            Some("[{\"id\":\"1\"}]".to_string())
        );
        assert!(dir.join(".notes.md.oplan-comments.json").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deleting_is_repeatable_and_leaves_nothing_behind() {
        let dir = temp_dir("openplan-core-sidecar-delete");
        let doc = dir.join("notes.md");
        write_comments(&doc, "[]").unwrap();

        delete_comments(&doc).unwrap();
        delete_comments(&doc).unwrap();

        assert!(!comments_path(&doc).unwrap().exists());
        assert_eq!(read_comments(&doc).unwrap(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn still_finds_comments_saved_under_the_pre_rename_name() {
        let dir = temp_dir("openplan-core-sidecar-legacy");
        let doc = dir.join("notes.md");
        std::fs::write(dir.join(".notes.md.omd-comments.json"), "legacy").unwrap();

        assert_eq!(read_comments(&doc).unwrap(), Some("legacy".to_string()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prefers_the_current_name_when_both_exist() {
        let dir = temp_dir("openplan-core-sidecar-both");
        let doc = dir.join("notes.md");
        std::fs::write(dir.join(".notes.md.omd-comments.json"), "legacy").unwrap();
        std::fs::write(dir.join(".notes.md.oplan-comments.json"), "current").unwrap();

        assert_eq!(read_comments(&doc).unwrap(), Some("current".to_string()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saving_moves_a_legacy_sidecar_to_the_current_name() {
        let dir = temp_dir("openplan-core-sidecar-migrate");
        let doc = dir.join("notes.md");
        let legacy = dir.join(".notes.md.omd-comments.json");
        std::fs::write(&legacy, "legacy").unwrap();

        write_comments(&doc, "current").unwrap();

        assert_eq!(read_comments(&doc).unwrap(), Some("current".to_string()));
        assert!(!legacy.exists(), "the old file should not be left behind");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deleting_also_clears_a_legacy_sidecar() {
        let dir = temp_dir("openplan-core-sidecar-delete-legacy");
        let doc = dir.join("notes.md");
        let legacy = dir.join(".notes.md.omd-comments.json");
        std::fs::write(&legacy, "legacy").unwrap();

        delete_comments(&doc).unwrap();

        assert!(!legacy.exists());
        assert_eq!(read_comments(&doc).unwrap(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
