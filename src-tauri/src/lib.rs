mod onboarding;
mod plans;
mod projects;

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
    openplan_core::fs::read_to_string(Path::new(&path))
}

/// Save edited markdown, atomically.
#[tauri::command]
async fn write_markdown(path: String, contents: String) -> Result<(), String> {
    openplan_core::fs::atomic_write(Path::new(&path), &contents)
}

#[tauri::command]
async fn read_comments(path: String) -> Result<Option<String>, String> {
    openplan_core::sidecar::read_comments(Path::new(&path))
}

#[tauri::command]
async fn write_comments(path: String, contents: String) -> Result<(), String> {
    openplan_core::sidecar::write_comments(Path::new(&path), &contents)
}

#[tauri::command]
async fn delete_comments(path: String) -> Result<(), String> {
    openplan_core::sidecar::delete_comments(Path::new(&path))
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
            "OpenPlan doesn't have permission to read this folder.".to_string()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            plans::setup(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            onboarding::app_settings,
            onboarding::complete_onboarding,
            onboarding::reset_onboarding,
            onboarding::discover_sources,
            onboarding::import_source,
            onboarding::install_tool,
            plans::get_base,
            plans::scan_plans,
            plans::get_standards,
            plans::set_standards_overrides,
            plans::get_authoring,
            plans::set_authoring,
            plans::search_plans,
            plans::set_plan_status,
            plans::commit_base,
            plans::plan_history,
            plans::plan_diff,
            plans::rename_plan,
            plans::rename_document,
            plans::app_identity,
            plans::comment_threads,
            plans::save_comment_threads,
            plans::plan_at_revision,
            plans::restore_plan_revision,
            projects::list_projects,
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
