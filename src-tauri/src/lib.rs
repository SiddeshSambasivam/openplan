use std::path::Path;

const MARKDOWN_EXTENSIONS: [&str; 7] = ["md", "markdown", "mdown", "mkd", "mkdn", "mdx", "txt"];
/// Safety valves so a scan of an enormous tree stays instant and the sidebar sane.
const MAX_FILES: usize = 2000;
const MAX_DEPTH: usize = 12;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileLeaf {
    id: String,
    name: String,
    path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    name: String,
    path: String,
    dirs: Vec<FolderNode>,
    files: Vec<FileLeaf>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    /// None when the folder contains no markdown files at all.
    root: Option<FolderNode>,
    total_files: usize,
    truncated: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    path: String,
    is_dir: bool,
    exists: bool,
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn display_name(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| {
            path.file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default()
        })
}

/// Recursively collect markdown files. Hidden entries are skipped, symlinked
/// directories are not followed (cycle safety), and subtrees with no markdown
/// anywhere beneath them are pruned.
fn walk(dir: &Path, depth: usize, count: &mut usize, truncated: &mut bool) -> Option<FolderNode> {
    if depth > MAX_DEPTH || *count >= MAX_FILES {
        *truncated = true;
        return None;
    }
    let read = std::fs::read_dir(dir).ok()?;
    let mut entries: Vec<std::fs::DirEntry> = read.flatten().collect();
    entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());

    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if file_type.is_dir() {
            if let Some(node) = walk(&path, depth + 1, count, truncated) {
                dirs.push(node);
            }
        } else if is_markdown(&path) {
            if *count >= MAX_FILES {
                *truncated = true;
                break;
            }
            *count += 1;
            let p = path.to_string_lossy().into_owned();
            files.push(FileLeaf {
                id: p.clone(),
                name: display_name(&path),
                path: p,
            });
        }
    }

    if dirs.is_empty() && files.is_empty() {
        return None;
    }
    let name = dir
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| dir.to_string_lossy().into_owned());
    Some(FolderNode {
        name,
        path: dir.to_string_lossy().into_owned(),
        dirs,
        files,
    })
}

/// Read a markdown file from disk. Files arrive via drag & drop or the file
/// picker, so paths are user-chosen; the command is a plain read with no
/// write access.
#[tauri::command]
async fn read_markdown(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => {
            "The file no longer exists at this location.".to_string()
        }
        std::io::ErrorKind::PermissionDenied => {
            "OpenMarkdown doesn't have permission to read this file.".to_string()
        }
        std::io::ErrorKind::InvalidData => {
            "This file isn't valid UTF-8 text.".to_string()
        }
        _ => e.to_string(),
    })
}

fn friendly_write_error(e: &std::io::Error) -> String {
    match e.kind() {
        std::io::ErrorKind::NotFound => {
            "The file's folder no longer exists at this location.".to_string()
        }
        std::io::ErrorKind::PermissionDenied => {
            "OpenMarkdown doesn't have permission to write this file.".to_string()
        }
        std::io::ErrorKind::StorageFull => "The disk is full.".to_string(),
        _ => e.to_string(),
    }
}

/// Write `contents` to `target` via a temp file in the same directory,
/// renamed over the target — so a crash mid-write can't corrupt it.
fn atomic_write(target: &Path, contents: &str) -> Result<(), String> {
    use std::io::Write;
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "Invalid file path.".to_string())?;
    let file_name = target
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid file name.".to_string())?;
    let tmp = dir.join(format!(".{file_name}.openmarkdown-tmp"));

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

/// Save edited markdown, atomically.
#[tauri::command]
async fn write_markdown(path: String, contents: String) -> Result<(), String> {
    atomic_write(&std::path::PathBuf::from(&path), &contents)
}

/// Comments live in a hidden JSON sidecar next to the doc (never inside it —
/// the app never rewrites content the user didn't ask it to touch), e.g.
/// `notes.md` -> `.notes.md.omd-comments.json`. Hidden dotfiles are already
/// skipped by `scan_folder`'s walk, so this never shows up in the sidebar.
fn sidecar_comments_path(doc_path: &Path) -> Result<std::path::PathBuf, String> {
    let dir = doc_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "Invalid file path.".to_string())?;
    let file_name = doc_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid file name.".to_string())?;
    Ok(dir.join(format!(".{file_name}.omd-comments.json")))
}

/// Read the comment sidecar for a markdown file. `None` (not an error) means
/// no comments have ever been saved for this file.
#[tauri::command]
async fn read_comments(path: String) -> Result<Option<String>, String> {
    let sidecar = sidecar_comments_path(&std::path::PathBuf::from(&path))?;
    match std::fs::read_to_string(&sidecar) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Save the comment sidecar for a markdown file, atomically.
#[tauri::command]
async fn write_comments(path: String, contents: String) -> Result<(), String> {
    let sidecar = sidecar_comments_path(&std::path::PathBuf::from(&path))?;
    atomic_write(&sidecar, &contents)
}

/// Remove the comment sidecar (called once the last thread on a doc is
/// deleted, so an empty file doesn't linger). Missing is not an error.
#[tauri::command]
async fn delete_comments(path: String) -> Result<(), String> {
    let sidecar = sidecar_comments_path(&std::path::PathBuf::from(&path))?;
    match std::fs::remove_file(&sidecar) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Build the markdown tree of a folder for the sidebar's nested list view.
#[tauri::command]
async fn scan_folder(path: String) -> Result<ScanResult, String> {
    let p = std::path::PathBuf::from(&path);
    let meta = std::fs::metadata(&p).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => {
            "The folder no longer exists at this location.".to_string()
        }
        std::io::ErrorKind::PermissionDenied => {
            "OpenMarkdown doesn't have permission to read this folder.".to_string()
        }
        _ => e.to_string(),
    })?;
    if !meta.is_dir() {
        return Err("That path isn't a folder.".to_string());
    }
    let mut count = 0usize;
    let mut truncated = false;
    let root = walk(&p, 0, &mut count, &mut truncated);
    Ok(ScanResult {
        root,
        total_files: count,
        truncated,
    })
}

/// Tell files apart from folders for a batch of dropped paths.
#[tauri::command]
async fn classify_paths(paths: Vec<String>) -> Vec<PathInfo> {
    paths
        .into_iter()
        .map(|p| match std::fs::metadata(&p) {
            Ok(m) => PathInfo {
                is_dir: m.is_dir(),
                exists: true,
                path: p,
            },
            Err(_) => PathInfo {
                is_dir: false,
                exists: false,
                path: p,
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn write_read_roundtrip_and_overwrite() {
        let dir = std::env::temp_dir().join("openmarkdown-write-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("doc.md").to_string_lossy().into_owned();

        tauri::async_runtime::block_on(async {
            // fresh write
            super::write_markdown(path.clone(), "# hello\n\nworld".into())
                .await
                .unwrap();
            assert_eq!(
                super::read_markdown(path.clone()).await.unwrap(),
                "# hello\n\nworld"
            );
            // atomic overwrite of an existing file (rename-over path)
            super::write_markdown(path.clone(), "# v2 with unicode — ✓".into())
                .await
                .unwrap();
            assert_eq!(
                super::read_markdown(path.clone()).await.unwrap(),
                "# v2 with unicode — ✓"
            );
            // no temp file left behind
            let leftovers: Vec<_> = std::fs::read_dir(&dir)
                .unwrap()
                .flatten()
                .filter(|e| e.file_name().to_string_lossy().contains("tmp"))
                .collect();
            assert!(leftovers.is_empty());
            // write into a missing directory fails with a friendly error
            let bad = dir
                .join("no-such-dir")
                .join("x.md")
                .to_string_lossy()
                .into_owned();
            let err = super::write_markdown(bad, "x".into()).await.unwrap_err();
            assert!(err.contains("folder no longer exists"), "got: {err}");
        });

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn comments_sidecar_roundtrip_hidden_and_deletable() {
        let dir = std::env::temp_dir().join("openmarkdown-comments-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("notes.md").to_string_lossy().into_owned();

        tauri::async_runtime::block_on(async {
            // no sidecar yet -> None, not an error
            assert_eq!(super::read_comments(path.clone()).await.unwrap(), None);

            super::write_comments(path.clone(), "[{\"id\":\"1\"}]".into())
                .await
                .unwrap();
            assert_eq!(
                super::read_comments(path.clone()).await.unwrap(),
                Some("[{\"id\":\"1\"}]".to_string())
            );

            // sidecar is a hidden dotfile alongside the doc
            let sidecar = dir.join(".notes.md.omd-comments.json");
            assert!(sidecar.exists());

            super::delete_comments(path.clone()).await.unwrap();
            assert!(!sidecar.exists());
            assert_eq!(super::read_comments(path.clone()).await.unwrap(), None);
            // deleting again is a no-op, not an error
            super::delete_comments(path.clone()).await.unwrap();
        });

        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_markdown,
            write_markdown,
            scan_folder,
            classify_paths,
            read_comments,
            write_comments,
            delete_comments
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
