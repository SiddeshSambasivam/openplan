//! Where the plan base is. Kept outside the base itself, since it is what
//! tells the app and the CLI where to look — and both have to agree without
//! talking to each other.

use crate::base::{default_base_path, ensure_base, Base};
use crate::repo::{self, Author, Identity, ANONYMOUS};
use crate::fs::atomic_write;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct Settings {
    #[serde(rename = "basePath")]
    pub base_path: PathBuf,
    /// Added to the standards that ship with the app. Absent for everyone who
    /// has not written any.
    #[serde(rename = "standards", default, skip_serializing_if = "Option::is_none")]
    pub standards: Option<String>,
    /// What the person asked to be called, from onboarding.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// How this person is told apart from their teammates once a base is
    /// shared. Absent until they set one, in which case git's own config
    /// answers instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// Whether onboarding has been walked through on this machine.
    #[serde(default)]
    pub onboarded: bool,
    /// Which format agents write plan bodies in. Absent until the person
    /// picks one, which reads as markdown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authoring: Option<String>,
}

/// Markdown is token-efficient; HTML gives a richer page to review. Both are
/// plans under the same contract.
pub const DEFAULT_AUTHORING: &str = "markdown";
pub const AUTHORING_MODES: [&str; 2] = ["markdown", "html"];

/// The mode a stored value means. Anything this build does not recognise is
/// markdown, so a settings file from elsewhere never stops plans being written.
pub fn authoring_mode(stored: Option<&str>) -> &'static str {
    match stored.map(str::trim).map(str::to_lowercase).as_deref() {
        Some("html") => "html",
        _ => DEFAULT_AUTHORING,
    }
}

/// What this machine is set to, read the way the MCP server reads it.
pub fn current_authoring() -> &'static str {
    let stored = settings_path()
        .ok()
        .and_then(|path| read_settings(&path).ok().flatten())
        .and_then(|s| s.authoring);
    authoring_mode(stored.as_deref())
}

/// A blank setting is the same as an unset one; git configs in particular
/// are easy to leave empty.
fn filled(value: Option<String>) -> Option<String> {
    value.filter(|v| !v.trim().is_empty())
}

/// Settings win over git's config, and an anonymous fallback covers the
/// machine where neither is set. Name and email resolve separately so a
/// half-configured git still contributes what it has.
pub fn resolve_identity(
    settings_name: Option<String>,
    settings_email: Option<String>,
    git_name: Option<String>,
    git_email: Option<String>,
) -> Identity {
    Identity {
        name: filled(settings_name)
            .or(filled(git_name))
            .unwrap_or_else(|| ANONYMOUS.to_string()),
        email: filled(settings_email)
            .or(filled(git_email))
            .unwrap_or_else(|| format!("{ANONYMOUS}@openplan.local")),
    }
}

/// Who this machine's changes belong to, from this machine's real settings.
pub fn current_identity() -> Identity {
    let settings = settings_path()
        .ok()
        .and_then(|path| read_settings(&path).ok().flatten());
    let git = git2::Config::open_default().ok();
    let get = |key: &str| git.as_ref().and_then(|c| c.get_string(key).ok());
    resolve_identity(
        settings.as_ref().and_then(|s| s.name.clone()),
        settings.as_ref().and_then(|s| s.email.clone()),
        get("user.name"),
        get("user.email"),
    )
}

/// The author for anything this person does themselves.
pub fn me() -> Author {
    Author::person(&current_identity())
}

/// `~/.config/openplan/settings.json`, or the platform's equivalent.
pub fn settings_path() -> Result<PathBuf, String> {
    let dir = dirs::config_dir()
        .ok_or_else(|| "Couldn't find this system's configuration directory.".to_string())?;
    Ok(dir.join(crate::profile::name()).join("settings.json"))
}

/// `None` when OpenPlan has never run here, which is not an error.
pub fn read_settings(path: &Path) -> Result<Option<Settings>, String> {
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map(Some)
            .map_err(|e| format!("The OpenPlan settings are unreadable: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Couldn't read the OpenPlan settings: {e}")),
    }
}

pub fn write_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Couldn't create the settings directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Couldn't write the OpenPlan settings: {e}"))?;
    atomic_write(path, &format!("{json}\n"))
}

/// The base this machine should use, found the way a running app finds it.
pub fn resolve_default_base() -> Result<Base, String> {
    let home = dirs::home_dir().ok_or_else(|| "Couldn't find your home directory.".to_string())?;
    resolve_base(&settings_path()?, &home)
}

/// Standards used to be written into the base. They belong to the app now, so
/// the copy we left behind is taken back out — after the base has been
/// committed, so it stays recoverable in the history. A standards file someone
/// wrote themselves does not start the way ours did, and is left alone.
fn retire_standards_file(base: &Base) -> Result<bool, String> {
    let path = base.root.join("STANDARDS.md");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Ok(false);
    };
    if !text.starts_with("# Plan standards") {
        return Ok(false);
    }
    std::fs::remove_file(&path)
        .map_err(|e| format!("Couldn't retire the old standards file: {e}"))?;
    Ok(true)
}

/// The base this machine should use: whichever one was chosen before, or a
/// fresh one in the home directory. Either way it exists by the time this
/// returns, and the choice is recorded so the next caller agrees.
pub fn resolve_base(settings_file: &Path, home: &Path) -> Result<Base, String> {
    let existing = read_settings(settings_file)?;
    let chosen = existing
        .as_ref()
        .map(|s| s.base_path.clone())
        .unwrap_or_else(|| default_base_path(home));
    let base = ensure_base(&chosen)?;

    // Record whatever is in the base before touching it, so the first run has
    // a history and anything changed outside the app is captured rather than
    // rolled into someone's next edit.
    repo::init(&base.root)?;
    let first_run = !repo::has_commits(&base.root);
    repo::commit_all(
        &base.root,
        &Author::user(),
        if first_run {
            "init: plan base"
        } else {
            "sync: changes made outside OpenPlan"
        },
    )?;
    if retire_standards_file(&base)? {
        repo::commit_all(
            &base.root,
            &Author::user(),
            "remove: standards moved into OpenPlan's settings",
        )?;
    }

    let carried = existing.unwrap_or_default();
    write_settings(
        settings_file,
        &Settings {
            base_path: base.root.clone(),
            ..carried
        },
    )?;
    Ok(base)
}

#[cfg(test)]
mod tests {
    #[test]
    fn plans_are_written_in_markdown_unless_someone_asked_for_html() {
        assert_eq!(authoring_mode(None), DEFAULT_AUTHORING);
        assert_eq!(authoring_mode(Some("html")), "html");
        assert_eq!(authoring_mode(Some("HTML")), "html");
        assert_eq!(authoring_mode(Some("markdown")), "markdown");
        // A word from a build that knew something this one does not.
        assert_eq!(authoring_mode(Some("rtf")), DEFAULT_AUTHORING);
    }

    #[test]
    fn the_authoring_mode_is_remembered_across_launches() {
        let dir = temp_dir("openplan-core-settings-authoring");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");
        write_settings(
            &file,
            &Settings {
                base_path: default_base_path(&home),
                authoring: Some("html".to_string()),
                ..Default::default()
            },
        )
        .unwrap();

        resolve_base(&file, &home).unwrap();

        assert_eq!(
            read_settings(&file).unwrap().unwrap().authoring.as_deref(),
            Some("html")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn settings_written_before_the_mode_existed_still_read() {
        let dir = temp_dir("openplan-core-settings-no-authoring");
        let file = dir.join("settings.json");
        std::fs::write(&file, "{\"basePath\":\"/somewhere\"}\n").unwrap();

        let saved = read_settings(&file).unwrap().unwrap();

        assert_eq!(saved.authoring, None);
        assert_eq!(authoring_mode(saved.authoring.as_deref()), "markdown");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn what_someone_set_beats_what_git_guessed() {
        let id = resolve_identity(
            Some("Sid".into()),
            Some("sid@hypotenuse.ai".into()),
            Some("git name".into()),
            Some("git@example.com".into()),
        );
        assert_eq!(id.name, "Sid");
        assert_eq!(id.email, "sid@hypotenuse.ai");
    }

    #[test]
    fn git_answers_for_whatever_settings_leave_out() {
        let id = resolve_identity(
            None,
            None,
            Some("Sid Sambasivam".into()),
            Some("sid@hypotenuse.ai".into()),
        );
        assert_eq!(id.name, "Sid Sambasivam");
        assert_eq!(id.email, "sid@hypotenuse.ai");
    }

    #[test]
    fn a_blank_git_config_counts_as_unset() {
        let id = resolve_identity(None, None, Some("  ".into()), Some("".into()));
        assert_eq!(id.name, "user");
        assert_eq!(id.email, "user@openplan.local");
    }

    #[test]
    fn a_name_without_an_email_still_gets_an_identity() {
        let id = resolve_identity(Some("Sid".into()), None, None, None);
        assert_eq!(id.name, "Sid");
        assert_eq!(id.email, "user@openplan.local");
    }

    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn absent_settings_are_not_an_error() {
        let dir = temp_dir("openplan-core-settings-absent");

        assert_eq!(read_settings(&dir.join("settings.json")).unwrap(), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_chosen_base_is_read_back() {
        let dir = temp_dir("openplan-core-settings-roundtrip");
        let file = dir.join("nested").join("settings.json");
        let settings = Settings {
            base_path: PathBuf::from("/somewhere/plans"),
            standards: Some("Name the reviewer.".to_string()),
            name: Some("Sid".to_string()),
            email: Some("sid@hypotenuse.ai".to_string()),
            onboarded: true,
            authoring: Some("html".to_string()),
        };

        write_settings(&file, &settings).unwrap();

        assert_eq!(read_settings(&file).unwrap(), Some(settings));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_first_run_creates_a_base_in_the_home_directory_and_remembers_it() {
        let dir = temp_dir("openplan-core-settings-first-run");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");

        let base = resolve_base(&file, &home).unwrap();

        assert_eq!(base.root, home.join(crate::profile::base_dir_name()));
        assert!(base.plans_dir().is_dir());
        assert_eq!(
            read_settings(&file).unwrap().unwrap().base_path,
            home.join(crate::profile::base_dir_name())
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolving_the_base_does_not_discard_the_standards_someone_wrote() {
        let dir = temp_dir("openplan-core-settings-keeps-standards");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");
        write_settings(
            &file,
            &Settings {
                base_path: default_base_path(&home),
                standards: Some("Name the reviewer.".to_string()),
                ..Default::default()
            },
        )
        .unwrap();

        resolve_base(&file, &home).unwrap();

        assert_eq!(
            read_settings(&file).unwrap().unwrap().standards.as_deref(),
            Some("Name the reviewer.")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_standards_file_earlier_builds_left_behind_is_taken_back_out() {
        let dir = temp_dir("openplan-core-settings-retire");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");
        let base = ensure_base(&default_base_path(&home)).unwrap();
        let standards = base.root.join("STANDARDS.md");
        std::fs::write(&standards, "# Plan standards\n\nold copy\n").unwrap();

        resolve_base(&file, &home).unwrap();

        assert!(!standards.exists());
        // Recorded before removal, so it can still be read back.
        let revisions = repo::history(&base.root, Path::new("STANDARDS.md")).unwrap();
        assert!(!revisions.is_empty(), "the file was removed without a trace");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_standards_file_someone_wrote_themselves_is_left_alone() {
        let dir = temp_dir("openplan-core-settings-keep-theirs");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let base = ensure_base(&default_base_path(&home)).unwrap();
        let standards = base.root.join("STANDARDS.md");
        std::fs::write(&standards, "# How we write plans on this team\n").unwrap();

        resolve_base(&dir.join("settings.json"), &home).unwrap();

        assert!(standards.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_recorded_base_is_used_instead_of_the_default() {
        let dir = temp_dir("openplan-core-settings-relocated");
        let home = dir.join("home");
        let elsewhere = dir.join("Dropbox").join("plans");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");
        write_settings(
            &file,
            &Settings {
                base_path: elsewhere.clone(),
                ..Default::default()
            },
        )
        .unwrap();

        let base = resolve_base(&file, &home).unwrap();

        assert_eq!(base.root, elsewhere);
        assert!(elsewhere.join("plans").is_dir());
        assert!(!home.join(crate::profile::base_dir_name()).exists(), "the default was created anyway");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
