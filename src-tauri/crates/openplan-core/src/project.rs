//! A project is the git remote of the directory an agent worked in. Stored in
//! the plan as `host/owner/repo`, so the same repo written as an SSH remote,
//! an HTTPS URL, or just `owner/repo` is one project rather than three.

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
