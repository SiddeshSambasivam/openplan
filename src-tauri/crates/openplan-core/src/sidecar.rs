//! Comment threads live in a JSON sidecar beside the plan, never inside it —
//! the app only rewrites content the user asked it to touch. The leading dot
//! keeps the sidecar out of directory scans, which skip hidden entries.

use crate::fs::atomic_write;
use std::path::{Path, PathBuf};

const SIDECAR_SUFFIX: &str = "omd-comments.json";

pub fn comments_path(doc_path: &Path) -> Result<PathBuf, String> {
    let dir = doc_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "Invalid file path.".to_string())?;
    let file_name = doc_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid file name.".to_string())?;
    Ok(dir.join(format!(".{file_name}.{SIDECAR_SUFFIX}")))
}

/// `None` (rather than an error) means no comments have ever been saved.
pub fn read_comments(doc_path: &Path) -> Result<Option<String>, String> {
    let sidecar = comments_path(doc_path)?;
    match std::fs::read_to_string(&sidecar) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn write_comments(doc_path: &Path, contents: &str) -> Result<(), String> {
    atomic_write(&comments_path(doc_path)?, contents)
}

/// Called once a plan's last thread is deleted, so an empty file doesn't
/// linger. A sidecar that was never written is not an error.
pub fn delete_comments(doc_path: &Path) -> Result<(), String> {
    match std::fs::remove_file(comments_path(doc_path)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
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
        assert!(dir.join(".notes.md.omd-comments.json").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deleting_is_repeatable_and_leaves_nothing_behind() {
        let dir = temp_dir("openplan-core-sidecar-delete");
        let doc = dir.join("notes.md");
        write_comments(&doc, "[]").unwrap();

        delete_comments(&doc).unwrap();
        delete_comments(&doc).unwrap();

        assert!(!dir.join(".notes.md.omd-comments.json").exists());
        assert_eq!(read_comments(&doc).unwrap(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
