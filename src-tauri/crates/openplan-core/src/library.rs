//! Reading the base: what plans are in it, and finding text across them.
//! Both walk the directory on demand — the base is small enough that a scan
//! is instant, and an index would be a second copy of the truth to keep
//! current.

use crate::base::Base;
use crate::plan::{self, PlanMeta};
use std::path::{Path, PathBuf};

/// Enough to list a plan without reading its body twice.
#[derive(Debug, Clone, PartialEq)]
pub struct PlanEntry {
    pub meta: PlanMeta,
    pub path: PathBuf,
    /// Path within the base — what history is recorded against.
    pub relative_path: PathBuf,
}

/// One line of one plan that matched a search.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchHit {
    pub path: PathBuf,
    pub title: String,
    /// 1-indexed, so it can be shown as-is.
    pub line: usize,
    pub text: String,
}

const MARKDOWN_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdx"];
/// Enough context to recognise a match without pasting a whole paragraph.
const MAX_HIT_CHARS: usize = 240;
const MAX_HITS: usize = 200;

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Every markdown file under the base, hidden entries skipped — that is where
/// the sidecars and git live.
fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
    for entry in entries {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        match entry.file_type() {
            Ok(t) if t.is_dir() => walk(&path, out),
            Ok(t) if t.is_file() && is_markdown(&path) => out.push(path),
            _ => {}
        }
    }
}

pub fn plan_paths(base: &Base) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    walk(&base.root, &mut paths);
    paths
}

/// Every plan in the base, with the metadata needed to list it.
pub fn scan(base: &Base) -> Vec<PlanEntry> {
    plan_paths(base)
        .into_iter()
        .filter_map(|path| {
            let text = std::fs::read_to_string(&path).ok()?;
            let relative_path = path.strip_prefix(&base.root).ok()?.to_path_buf();
            Some(PlanEntry {
                meta: plan::parse(&text, &path).meta,
                path,
                relative_path,
            })
        })
        .collect()
}

/// Matching lines across every plan, searched when asked and never indexed.
/// The plan's title is carried along so results can be grouped without a
/// second read.
pub fn search(base: &Base, query: &str) -> Vec<SearchHit> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }
    let mut hits = Vec::new();
    for path in plan_paths(base) {
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let title = plan::parse(&text, &path).meta.title;
        for (index, line) in text.lines().enumerate() {
            if hits.len() >= MAX_HITS {
                return hits;
            }
            if !line.to_lowercase().contains(&needle) {
                continue;
            }
            let trimmed = line.trim();
            let text = match trimmed.char_indices().nth(MAX_HIT_CHARS) {
                Some((end, _)) => format!("{}…", &trimmed[..end]),
                None => trimmed.to_string(),
            };
            hits.push(SearchHit {
                path: path.clone(),
                title: title.clone(),
                line: index + 1,
                text,
            });
        }
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::base::ensure_base;

    fn temp_base(name: &str) -> Base {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        ensure_base(&dir).unwrap()
    }

    fn write(base: &Base, rel: &str, text: &str) {
        let path = base.root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn lists_every_plan_with_the_metadata_needed_to_show_it() {
        let base = temp_base("openplan-core-library-scan");
        write(&base, "plans/a.md", "---\ntitle: Alpha\nstatus: approved\n---\n# Alpha\n");
        write(&base, "plans/nested/b.md", "# Beta\n");

        let entries = scan(&base);

        let titles: Vec<&str> = entries.iter().map(|e| e.meta.title.as_str()).collect();
        assert!(titles.contains(&"Alpha"), "got {titles:?}");
        assert!(titles.contains(&"Beta"), "got {titles:?}");
        let alpha = entries.iter().find(|e| e.meta.title == "Alpha").unwrap();
        assert_eq!(alpha.relative_path, Path::new("plans/a.md"));
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn what_git_keeps_in_the_base_is_not_a_plan() {
        let base = temp_base("openplan-core-library-hidden");
        std::fs::create_dir_all(base.root.join(".git")).unwrap();
        write(&base, ".git/hidden.md", "# Not a plan\n");
        write(&base, "plans/real.md", "# Real\n");

        let titles: Vec<String> = scan(&base).into_iter().map(|e| e.meta.title).collect();

        assert_eq!(titles, vec!["Real"]);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn finds_matching_lines_and_says_where_they_are() {
        let base = temp_base("openplan-core-library-search");
        write(&base, "plans/a.md", "# Alpha\n\nthe cache is warm\nunrelated\n");

        let hits = search(&base, "CACHE");

        let hit = hits.iter().find(|h| h.text.contains("cache")).unwrap();
        assert_eq!(hit.line, 3);
        assert_eq!(hit.title, "Alpha");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn an_empty_query_matches_nothing_rather_than_everything() {
        let base = temp_base("openplan-core-library-empty-query");
        write(&base, "plans/a.md", "# Alpha\n");

        assert_eq!(search(&base, "   "), vec![]);

        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_very_long_line_is_shortened_rather_than_returned_whole() {
        let base = temp_base("openplan-core-library-long-line");
        write(&base, "plans/a.md", &format!("# A\n\n{}\n", "needle ".repeat(200)));

        let hit = search(&base, "needle").into_iter().next().unwrap();

        assert!(hit.text.chars().count() <= MAX_HIT_CHARS + 1, "{}", hit.text.len());
        assert!(hit.text.ends_with('…'));
        let _ = std::fs::remove_dir_all(&base.root);
    }
}
