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
    /// The document to open: the plan itself, or a set's README.
    pub path: PathBuf,
    /// Path within the base — what history is recorded against.
    pub relative_path: PathBuf,
    /// The documents in a set, in reading order, relative to the set's folder.
    /// Empty for a plan that is a single file.
    pub documents: Vec<PathBuf>,
}

/// The entry points of a plan set. A large change is written as a folder — see
/// the standards — so a folder holding one of these is one plan, not thirty.
pub const SET_ENTRIES: [&str; 2] = ["README.md", "README.html"];

/// A set's entry point: its README, or failing that the first of its numbered
/// documents, which is how plan sets that lead with `00-overview.md` are
/// written. `None` means the folder is somewhere plans are kept, not a plan.
pub fn set_entry(dir: &Path) -> Option<PathBuf> {
    for name in SET_ENTRIES {
        let readme = dir.join(name);
        if readme.is_file() {
            return Some(readme);
        }
    }
    let mut numbered: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && is_plan(p)
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("00-"))
        })
        .collect();
    numbered.sort();
    numbered.into_iter().next()
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

/// What a plan can be written in. HTML plans sit under the same contract as
/// markdown ones, so everything that walks the base reads both.
const PLAN_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdx", "html", "htm"];
/// Enough context to recognise a match without pasting a whole paragraph.
const MAX_HIT_CHARS: usize = 240;
const MAX_HITS: usize = 200;

pub(crate) fn is_plan(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| PLAN_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Every document in a set, in reading order — which is the order the names
/// sort in, since plan sets number their documents.
fn set_documents(dir: &Path, prefix: &Path, out: &mut Vec<PathBuf>) {
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
        let relative = prefix.join(entry.file_name());
        match entry.file_type() {
            Ok(t) if t.is_dir() => set_documents(&path, &relative, out),
            Ok(t) if t.is_file() && is_plan(&path) => out.push(relative),
            _ => {}
        }
    }
}

/// Walks the base, treating a folder with a README as one plan rather
/// than descending into its documents. Hidden entries are skipped — that is
/// where git and the sidecars live.
fn walk(dir: &Path, out: &mut Vec<(PathBuf, Vec<PathBuf>)>) {
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
            Ok(t) if t.is_dir() => match set_entry(&path) {
                Some(entry) => {
                    let mut documents = Vec::new();
                    set_documents(&path, Path::new(""), &mut documents);
                    out.push((entry, documents));
                }
                None => walk(&path, out),
            },
            Ok(t) if t.is_file() && is_plan(&path) => out.push((path, Vec::new())),
            _ => {}
        }
    }
}

/// Every document a search should read, sets included.
pub fn plan_paths(base: &Base) -> Vec<PathBuf> {
    fn every(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let path = entry.path();
            match entry.file_type() {
                Ok(t) if t.is_dir() => every(&path, out),
                Ok(t) if t.is_file() && is_plan(&path) => out.push(path),
                _ => {}
            }
        }
    }
    let mut paths = Vec::new();
    every(&base.root, &mut paths);
    paths.sort();
    paths
}

/// Every plan in the base, with the metadata needed to list it.
pub fn scan(base: &Base) -> Vec<PlanEntry> {
    let mut found = Vec::new();
    walk(&base.root, &mut found);
    found
        .into_iter()
        .filter_map(|(path, documents)| {
            let text = std::fs::read_to_string(&path).ok()?;
            let relative_path = path.strip_prefix(&base.root).ok()?.to_path_buf();
            let mut meta = plan::parse(&text, &path).meta;
            // A set is named by its folder, not by the README inside it.
            if !documents.is_empty() {
                if let Some(folder) = path.parent().and_then(|p| p.file_name()) {
                    meta.id = folder.to_string_lossy().into_owned();
                }
            }
            Some(PlanEntry {
                meta,
                path,
                relative_path,
                documents,
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
        assert!(alpha.documents.is_empty(), "a single file is not a set");
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
    fn a_folder_of_documents_is_one_plan_not_thirty() {
        let base = temp_base("openplan-core-library-set");
        write(&base, "plans/react-migration/README.md", "# React 17 to 19\n");
        write(&base, "plans/react-migration/01-current-state.md", "# Current state\n");
        write(&base, "plans/react-migration/02-phase-one.md", "# Phase one\n");
        write(&base, "plans/react-migration/archive/old.md", "# Superseded\n");

        let entries = scan(&base);

        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0].meta.title, "React 17 to 19");
        assert_eq!(entries[0].meta.id, "react-migration", "named by its folder");
        assert_eq!(entries[0].documents.len(), 4, "every document in the set");
        assert_eq!(entries[0].documents[0], Path::new("01-current-state.md"), "in reading order");
        assert!(entries[0].path.ends_with("README.md"), "opens at its entry point");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_set_that_leads_with_a_numbered_overview_is_still_one_plan() {
        let base = temp_base("openplan-core-library-numbered-entry");
        write(&base, "plans/pdb-search/00-overview.md", "# PDB Search v1\n");
        write(&base, "plans/pdb-search/01-architecture.md", "# Architecture\n");

        let entries = scan(&base);

        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0].meta.title, "PDB Search v1");
        assert_eq!(entries[0].documents.len(), 2);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn an_html_plan_is_listed_like_any_other() {
        let base = temp_base("openplan-core-library-html");
        write(
            &base,
            "plans/rendered.html",
            "<!--\n---\ntitle: Rendered\nstatus: in-review\n---\n-->\n<h1>Rendered</h1>\n",
        );

        let entries = scan(&base);

        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0].meta.title, "Rendered");
        assert_eq!(entries[0].meta.status, crate::plan::Status::InReview);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_set_can_open_at_an_html_readme_and_mix_both_kinds() {
        let base = temp_base("openplan-core-library-html-set");
        write(&base, "plans/rendered-set/README.html", "<h1>The set</h1>\n");
        write(&base, "plans/rendered-set/01-detail.md", "# Detail\n");
        write(&base, "plans/rendered-set/02-diagram.html", "<h1>Diagram</h1>\n");

        let entries = scan(&base);

        assert_eq!(entries.len(), 1, "{entries:?}");
        assert_eq!(entries[0].meta.title, "The set");
        assert!(entries[0].path.ends_with("README.html"));
        assert_eq!(entries[0].documents.len(), 3);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_search_reads_html_plans_too() {
        let base = temp_base("openplan-core-library-html-search");
        write(&base, "plans/rendered.html", "<h1>R</h1>\n<p>the cache is warm</p>\n");

        let hits = search(&base, "cache is warm");

        assert_eq!(hits.len(), 1, "{hits:?}");
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_folder_without_an_entry_point_is_just_where_plans_are_kept() {
        let base = temp_base("openplan-core-library-no-readme");
        write(&base, "plans/a.md", "# Alpha\n");
        write(&base, "plans/nested/b.md", "# Beta\n");

        assert_eq!(scan(&base).len(), 2);

        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_search_still_reads_every_document_inside_a_set() {
        let base = temp_base("openplan-core-library-search-set");
        write(&base, "plans/set/README.md", "# The set\n");
        write(&base, "plans/set/03-detail.md", "# Detail\n\nthe cache is warm\n");

        let hits = search(&base, "cache is warm");

        assert_eq!(hits.len(), 1, "{hits:?}");
        assert!(hits[0].path.ends_with("03-detail.md"));
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

    #[test]
    fn a_scan_says_where_every_plan_stands() {
        use crate::plan::Status;
        let base = temp_base("openplan-core-library-status");
        let plans = base.plans_dir();
        std::fs::write(plans.join("mine.md"), "---\ntitle: Mine\n---\n# Mine\n").unwrap();
        std::fs::write(
            plans.join("theirs.md"),
            "---\ntitle: Theirs\nstatus: in-progress\n---\n# Theirs\n",
        )
        .unwrap();
        // Written by a build from before statuses were stored.
        std::fs::write(
            plans.join("done.md"),
            "---\ntitle: Done\nsource: claude-code\ntags: archived\n---\n# Done\n",
        )
        .unwrap();

        let entries = scan(&base);
        let of = |id: &str| {
            entries
                .iter()
                .find(|e| e.meta.id == id)
                .unwrap_or_else(|| panic!("no {id}"))
                .meta
                .status
        };

        assert_eq!(of("mine"), Status::Draft);
        assert_eq!(of("theirs"), Status::InProgress);
        assert_eq!(of("done"), Status::Completed);
        let _ = std::fs::remove_dir_all(&base.root);
    }
}
