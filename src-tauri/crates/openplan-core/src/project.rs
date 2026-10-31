//! A project is the git remote of the directory an agent worked in. Stored in
//! the plan as `host/owner/repo`, so the same repo written as an SSH remote,
//! an HTTPS URL, or just `owner/repo` is one project rather than three.

use crate::base::Base;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Written when a remote names no host of its own, which is how people say
/// `owner/repo` out loud.
const DEFAULT_HOST: &str = "github.com";

const SCHEMES: [&str; 5] = ["https://", "http://", "ssh://", "git://", "git+ssh://"];

/// Turns a remote, in any of the forms git and people write them in, into
/// `host/owner/repo`. Text that is not a remote is returned as it was: a plan
/// filed outside a repo records its folder name, and that is a project too.
pub fn normalize(text: &str) -> String {
    let trimmed = text.trim();
    let mut rest = trimmed;
    let lower = trimmed.to_lowercase();
    let mut had_scheme = false;
    for scheme in SCHEMES {
        if let Some(stripped) = lower.strip_prefix(scheme) {
            rest = &trimmed[trimmed.len() - stripped.len()..];
            had_scheme = true;
            break;
        }
    }
    // `git@host:owner/repo` and `user@host/owner/repo` name the same thing.
    if let Some((_, after)) = rest.split_once('@') {
        rest = after;
    } else if !had_scheme && (trimmed.starts_with('/') || trimmed.starts_with('~')) {
        // A path someone typed, not a remote.
        return trimmed.to_string();
    }
    let rest = rest.replacen(':', "/", 1);
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);

    let parts: Vec<&str> = rest.split('/').filter(|p| !p.is_empty()).collect();
    if parts.iter().any(|p| p.contains(char::is_whitespace)) {
        return trimmed.to_string();
    }
    match parts.len() {
        0 | 1 => trimmed.to_string(),
        2 if !parts[0].contains('.') => format!("{DEFAULT_HOST}/{}/{}", parts[0], parts[1]),
        2 => trimmed.to_string(),
        _ => format!("{}/{}", parts[0].to_lowercase(), parts[1..].join("/")),
    }
}

/// Splits a normalised project into its host and the rest. `None` when the
/// project is a folder name rather than a remote.
fn split_host(project: &str) -> Option<(&str, &str)> {
    let (host, rest) = project.split_once('/')?;
    if !host.contains('.') || rest.is_empty() {
        return None;
    }
    Some((host, rest))
}

/// What to show next to a plan: `owner/repo` for a remote, the text itself
/// for anything else.
pub fn short_name(project: &str) -> String {
    let normalized = normalize(project);
    match split_host(&normalized) {
        Some((_, rest)) => rest.to_string(),
        None => normalized,
    }
}

/// The remote's owner, whose avatar stands for the project. `None` when the
/// project is not a remote.
pub fn owner(project: &str) -> Option<String> {
    let normalized = normalize(project);
    let (_, rest) = split_host(&normalized)?;
    Some(rest.split('/').next()?.to_string())
}

/// One line about what a repo is, written by the first agent that files into
/// it. Kept in the base, beside the plans it describes.
pub const DESCRIPTIONS_FILE: &str = "projects.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Described {
    description: String,
}

/// What each project is, by normalised project. Missing or unreadable reads
/// as nothing described yet, which is what a first run looks like.
pub fn read_descriptions(base: &Base) -> BTreeMap<String, String> {
    let path = base.root.join(DESCRIPTIONS_FILE);
    let Ok(raw) = std::fs::read_to_string(path) else {
        return BTreeMap::new();
    };
    serde_json::from_str::<BTreeMap<String, Described>>(&raw)
        .map(|read| read.into_iter().map(|(k, v)| (k, v.description)).collect())
        .unwrap_or_default()
}

/// Replaces whatever the project said before. One line is the whole point.
pub fn set_description(base: &Base, project: &str, description: &str) -> Result<(), String> {
    let mut described = read_descriptions(base);
    described.insert(normalize(project), description.trim().to_string());
    let wrapped: BTreeMap<String, Described> = described
        .into_iter()
        .map(|(k, description)| (k, Described { description }))
        .collect();
    let json = serde_json::to_string_pretty(&wrapped)
        .map_err(|e| format!("Couldn't write the project descriptions: {e}"))?;
    crate::fs::atomic_write(&base.root.join(DESCRIPTIONS_FILE), &format!("{json}\n"))
}

/// A project as the app lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    /// `None` for the plans that name no project at all.
    pub project: Option<String>,
    pub name: String,
    pub description: Option<String>,
    /// An image the webview loads and caches. GitHub serves one per owner;
    /// other hosts have no equivalent, so they get none.
    pub avatar_url: Option<String>,
    pub plans: usize,
}

fn avatar_url(project: &str) -> Option<String> {
    let (host, _) = split_host(project)?;
    if host != DEFAULT_HOST {
        return None;
    }
    Some(format!("https://{DEFAULT_HOST}/{}.png?size=64", owner(project)?))
}

/// Every project in the base, busiest first, with the plans that belong to no
/// project last.
pub fn list(base: &Base) -> Vec<ProjectSummary> {
    let described = read_descriptions(base);
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut without = 0usize;
    for entry in crate::library::scan(base) {
        match entry.meta.project.as_deref().map(normalize).filter(|p| !p.is_empty()) {
            Some(project) => *counts.entry(project).or_default() += 1,
            None => without += 1,
        }
    }
    let mut summaries: Vec<ProjectSummary> = counts
        .into_iter()
        .map(|(project, plans)| ProjectSummary {
            name: short_name(&project),
            description: described.get(&project).cloned(),
            avatar_url: avatar_url(&project),
            project: Some(project),
            plans,
        })
        .collect();
    summaries.sort_by(|a, b| b.plans.cmp(&a.plans).then_with(|| a.name.cmp(&b.name)));
    if without > 0 {
        summaries.push(ProjectSummary {
            project: None,
            name: "No project".to_string(),
            description: None,
            avatar_url: None,
            plans: without,
        });
    }
    summaries
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

    fn write_plan(base: &Base, id: &str, project: Option<&str>) {
        let project = project.map(|p| format!("project: {p}\n")).unwrap_or_default();
        std::fs::write(
            base.plans_dir().join(format!("{id}.md")),
            format!("---\ntitle: {id}\n{project}---\n# {id}\n"),
        )
        .unwrap();
    }

    #[test]
    fn every_way_of_writing_one_remote_is_the_same_project() {
        for written in [
            "git@github.com:owner/repo.git",
            "https://github.com/owner/repo.git",
            "https://github.com/owner/repo",
            "https://github.com/owner/repo/",
            "ssh://git@github.com/owner/repo.git",
            "github.com/owner/repo",
            "owner/repo",
            "  owner/repo  ",
        ] {
            assert_eq!(normalize(written), "github.com/owner/repo", "{written}");
        }
    }

    #[test]
    fn a_host_that_is_not_github_is_kept() {
        assert_eq!(normalize("git@gitlab.com:acme/api.git"), "gitlab.com/acme/api");
        assert_eq!(normalize("https://git.acme.test/acme/api"), "git.acme.test/acme/api");
    }

    #[test]
    fn a_gitlab_subgroup_is_part_of_the_project() {
        assert_eq!(
            normalize("git@gitlab.com:acme/platform/api.git"),
            "gitlab.com/acme/platform/api"
        );
    }

    #[test]
    fn the_host_is_lowercased_and_the_repo_is_left_as_written() {
        assert_eq!(normalize("HTTPS://GitHub.com/Acme/API"), "github.com/Acme/API");
    }

    #[test]
    fn text_that_is_not_a_remote_comes_back_as_it_was() {
        for written in ["hypotenuse", "/Users/sid/code/hypotenuse", "~/code/api", "", "  "] {
            assert_eq!(normalize(written), written.trim(), "{written}");
        }
    }

    #[test]
    fn a_short_name_drops_the_host_but_keeps_a_folder_name_whole() {
        assert_eq!(short_name("github.com/owner/repo"), "owner/repo");
        assert_eq!(short_name("git@github.com:owner/repo.git"), "owner/repo");
        assert_eq!(short_name("gitlab.com/acme/platform/api"), "acme/platform/api");
        assert_eq!(short_name("hypotenuse"), "hypotenuse");
    }

    #[test]
    fn the_owner_is_who_the_avatar_belongs_to() {
        assert_eq!(owner("github.com/owner/repo").as_deref(), Some("owner"));
        assert_eq!(owner("gitlab.com/acme/platform/api").as_deref(), Some("acme"));
        assert_eq!(owner("hypotenuse"), None);
    }

    #[test]
    fn a_base_nobody_has_described_yet_reads_as_empty() {
        let base = temp_base("openplan-core-project-no-descriptions");

        assert!(read_descriptions(&base).is_empty());

        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_description_is_written_under_the_normalised_project_and_read_back() {
        let base = temp_base("openplan-core-project-describe");

        set_description(&base, "git@github.com:acme/api.git", "  The public API.  ").unwrap();

        let raw = std::fs::read_to_string(base.root.join(DESCRIPTIONS_FILE)).unwrap();
        assert!(raw.contains("\"github.com/acme/api\""), "{raw}");
        assert!(raw.contains("\"description\""), "{raw}");
        assert_eq!(
            read_descriptions(&base).get("github.com/acme/api").map(String::as_str),
            Some("The public API.")
        );
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn describing_a_project_again_replaces_the_line_and_leaves_the_others() {
        let base = temp_base("openplan-core-project-redescribe");

        set_description(&base, "acme/api", "First.").unwrap();
        set_description(&base, "acme/web", "The site.").unwrap();
        set_description(&base, "acme/api", "Second.").unwrap();

        let described = read_descriptions(&base);
        assert_eq!(described.get("github.com/acme/api").map(String::as_str), Some("Second."));
        assert_eq!(described.get("github.com/acme/web").map(String::as_str), Some("The site."));
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn projects_are_listed_busiest_first_with_the_unassigned_plans_last() {
        let base = temp_base("openplan-core-project-list");
        write_plan(&base, "one", Some("git@github.com:acme/api.git"));
        write_plan(&base, "two", Some("https://github.com/acme/api"));
        write_plan(&base, "three", Some("gitlab.com/acme/web"));
        write_plan(&base, "four", None);
        set_description(&base, "acme/api", "The public API.").unwrap();

        let listed = list(&base);

        assert_eq!(listed.len(), 3, "{listed:?}");
        assert_eq!(listed[0].project.as_deref(), Some("github.com/acme/api"));
        assert_eq!(listed[0].name, "acme/api");
        assert_eq!(listed[0].plans, 2, "the two ways of writing it are one project");
        assert_eq!(listed[0].description.as_deref(), Some("The public API."));
        assert_eq!(
            listed[0].avatar_url.as_deref(),
            Some("https://github.com/acme.png?size=64")
        );
        assert_eq!(listed[1].name, "acme/web");
        assert_eq!(listed[1].avatar_url, None, "only GitHub serves one per owner");
        assert_eq!(listed[1].description, None);
        assert_eq!(listed[2].project, None);
        assert_eq!(listed[2].name, "No project");
        assert_eq!(listed[2].plans, 1);
        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_base_where_every_plan_names_a_project_has_no_leftover_row() {
        let base = temp_base("openplan-core-project-list-complete");
        write_plan(&base, "one", Some("acme/api"));

        assert_eq!(list(&base).len(), 1);

        let _ = std::fs::remove_dir_all(&base.root);
    }

    #[test]
    fn a_listed_project_is_json_the_app_can_read_as_it_is() {
        let base = temp_base("openplan-core-project-list-shape");
        write_plan(&base, "one", Some("acme/api"));

        let json = serde_json::to_string(&list(&base)[0]).unwrap();

        assert_eq!(
            json,
            r#"{"project":"github.com/acme/api","name":"acme/api","description":null,"avatarUrl":"https://github.com/acme.png?size=64","plans":1}"#
        );
        let _ = std::fs::remove_dir_all(&base.root);
    }
}
