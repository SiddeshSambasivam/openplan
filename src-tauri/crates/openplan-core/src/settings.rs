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
    /// Whether agents may add videos and interactive pieces. Absent until the
    /// person turns it on, which reads as off.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<bool>,
    /// Whether sending a review starts the agent's turn in an idle session.
    /// Absent reads as on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wake: Option<bool>,
    /// Days a completed plan waits before the app archives it. Absent reads
    /// as the default, and 0 means never.
    #[serde(rename = "archiveAfterDays", default, skip_serializing_if = "Option::is_none")]
    pub archive_after_days: Option<u32>,
    /// The alignment score, as a percentage, the person wants before Build.
    /// It never stops Build. Absent reads as the default, and 0 means none.
    #[serde(rename = "alignmentTarget", default, skip_serializing_if = "Option::is_none")]
    pub alignment_target: Option<u32>,
    /// The file name of the person's picture, kept beside the settings file.
    /// Absent means the generated marble.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
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
    authoring_mode(saved().and_then(|s| s.authoring).as_deref())
}

/// Off unless someone turned it on: media makes the base heavier.
pub fn media_on(stored: Option<bool>) -> bool {
    stored.unwrap_or(false)
}

/// What this machine is set to, read the way the MCP server reads it.
pub fn current_media() -> bool {
    media_on(saved().and_then(|s| s.media))
}

/// On unless someone turned it off: an agent that hears at once is the point.
pub fn wake_on(stored: Option<bool>) -> bool {
    stored.unwrap_or(true)
}

pub fn current_wake() -> bool {
    wake_on(saved().and_then(|s| s.wake))
}

pub const DEFAULT_ARCHIVE_AFTER_DAYS: u32 = 7;

pub fn archive_after_days(stored: Option<u32>) -> u32 {
    stored.unwrap_or(DEFAULT_ARCHIVE_AFTER_DAYS)
}

/// What this machine is set to.
pub fn current_archive_after_days() -> u32 {
    archive_after_days(saved().and_then(|s| s.archive_after_days))
}

pub const DEFAULT_ALIGNMENT_TARGET: u32 = 80;

/// A stored value past 100 reads as 100, the most a score can reach.
pub fn alignment_target(stored: Option<u32>) -> u32 {
    stored.unwrap_or(DEFAULT_ALIGNMENT_TARGET).min(100)
}

/// What this machine is set to.
pub fn current_alignment_target() -> u32 {
    alignment_target(saved().and_then(|s| s.alignment_target))
}

/// Sets the name and email the person typed. A blank field is stored as
/// absent, so the git config answers for it again. Nothing changes when the
/// email is refused.
pub fn apply_profile(
    settings: &mut Settings,
    name: Option<String>,
    email: Option<String>,
) -> Result<(), String> {
    let email = filled(email).map(|e| e.trim().to_string());
    if let Some(email) = &email {
        check_email(email)?;
    }
    settings.name = filled(name).map(|n| n.trim().to_string());
    settings.email = email;
    Ok(())
}

pub const AVATAR_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];
pub const AVATAR_MAX_BYTES: u64 = 5 * 1024 * 1024;
const AVATAR_PREFIX: &str = "avatar-";

/// Copies the chosen picture into `dir` as `avatar-<stamp>.<ext>` and removes
/// the pictures saved before it. Returns the new file name. A new stamp gives
/// a new URL, so the webview never shows a cached old picture.
pub fn save_avatar(dir: &Path, source: &Path, stamp: &str) -> Result<String, String> {
    let ext = avatar_extension(source)?;
    check_avatar_size(source)?;
    let name = format!("{AVATAR_PREFIX}{stamp}.{ext}");
    std::fs::copy(source, dir.join(&name))
        .map_err(|e| format!("Couldn't save the picture: {e}"))?;
    remove_avatars_except(dir, Some(&name))?;
    Ok(name)
}

/// Deletes every saved picture in `dir`.
pub fn remove_avatars(dir: &Path) -> Result<(), String> {
    remove_avatars_except(dir, None)
}

/// The picture's absolute path, only while its file exists.
pub fn avatar_path(dir: &Path, stored: Option<&str>) -> Option<PathBuf> {
    stored.map(|name| dir.join(name)).filter(|path| path.is_file())
}

/// The directory that holds the settings file and the picture.
pub fn settings_dir() -> Result<PathBuf, String> {
    let path = settings_path()?;
    path.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "The settings file has no directory.".to_string())
}

/// This machine's picture, if the person set one.
pub fn current_avatar() -> Option<PathBuf> {
    avatar_path(&settings_dir().ok()?, saved()?.avatar.as_deref())
}

/// This machine's settings, or none when they cannot be read. Callers fall
/// back to their defaults rather than stop.
fn saved() -> Option<Settings> {
    settings_path()
        .ok()
        .and_then(|path| read_settings(&path).ok().flatten())
}

/// A blank setting is the same as an unset one; git configs in particular
/// are easy to leave empty.
fn filled(value: Option<String>) -> Option<String> {
    value.filter(|v| !v.trim().is_empty())
}

fn check_email(email: &str) -> Result<(), String> {
    if email.chars().any(char::is_whitespace) {
        return Err("An email can't contain spaces.".to_string());
    }
    match email.split_once('@') {
        Some((local, domain)) if !local.is_empty() && !domain.is_empty() => Ok(()),
        _ => Err("An email needs text on both sides of the @.".to_string()),
    }
}

fn avatar_extension(source: &Path) -> Result<String, String> {
    source
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .filter(|e| AVATAR_EXTENSIONS.contains(&e.as_str()))
        .ok_or_else(|| "Pick a PNG, JPEG, WebP or GIF picture.".to_string())
}

fn check_avatar_size(source: &Path) -> Result<(), String> {
    let size = std::fs::metadata(source)
        .map_err(|e| format!("Couldn't read the picture: {e}"))?
        .len();
    if size > AVATAR_MAX_BYTES {
        return Err("That picture is over 5 MB. Pick a smaller one.".to_string());
    }
    Ok(())
}

fn remove_avatars_except(dir: &Path, keep: Option<&str>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Couldn't read the settings directory: {e}"))?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if name.starts_with(AVATAR_PREFIX) && Some(name) != keep {
            std::fs::remove_file(entry.path())
                .map_err(|e| format!("Couldn't remove the old picture: {e}"))?;
        }
    }
    Ok(())
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
/// fresh one in the home directory. Either way it exists as a git repository
/// by the time this returns, and the choice is recorded so the next caller
/// agrees. Nothing is committed here: see `sync_base`.
pub fn resolve_base(settings_file: &Path, home: &Path) -> Result<Base, String> {
    let existing = read_settings(settings_file)?;
    let chosen = existing
        .as_ref()
        .map(|s| s.base_path.clone())
        .unwrap_or_else(|| default_base_path(home));
    let base = ensure_base(&chosen)?;
    repo::init(&base.root)?;

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

/// Records whatever changed in the base while nobody was watching, so the
/// first run has a history and an outside edit is captured rather than rolled
/// into whoever saves next. It takes git's index lock, so it belongs to the
/// one place that owns the base, once at startup and then on each change the
/// watcher reports; callers that only read must never run it.
pub fn sync_base(base: &Base) -> Result<(), String> {
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
    if retire_standards_file(base)? {
        repo::commit_all(
            &base.root,
            &Author::user(),
            "remove: standards moved into OpenPlan's settings",
        )?;
    }
    Ok(())
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
    fn media_is_off_until_someone_turns_it_on() {
        let dir = temp_dir("openplan-core-settings-media");
        let file = dir.join("settings.json");
        std::fs::write(&file, "{\"basePath\":\"/somewhere\"}\n").unwrap();

        let saved = read_settings(&file).unwrap().unwrap();

        assert_eq!(saved.media, None);
        assert!(!media_on(saved.media));
        assert!(media_on(Some(true)));
        assert!(!media_on(Some(false)));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn waking_the_agent_is_on_until_someone_turns_it_off() {
        let dir = temp_dir("openplan-core-settings-wake");
        let file = dir.join("settings.json");
        std::fs::write(&file, "{\"basePath\":\"/somewhere\"}\n").unwrap();

        let saved = read_settings(&file).unwrap().unwrap();

        assert_eq!(saved.wake, None);
        assert!(wake_on(saved.wake));
        assert!(!wake_on(Some(false)));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn completed_plans_are_archived_after_a_week_unless_someone_chose_otherwise() {
        let dir = temp_dir("openplan-core-settings-archive-days");
        let file = dir.join("settings.json");
        std::fs::write(&file, "{\"basePath\":\"/somewhere\"}\n").unwrap();

        let saved = read_settings(&file).unwrap().unwrap();

        assert_eq!(saved.archive_after_days, None);
        assert_eq!(archive_after_days(saved.archive_after_days), 7);
        assert_eq!(archive_after_days(Some(30)), 30);
        assert_eq!(archive_after_days(Some(0)), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_alignment_target_is_80_until_someone_sets_one() {
        let dir = temp_dir("openplan-core-settings-alignment-target");
        let file = dir.join("settings.json");
        std::fs::write(&file, "{\"basePath\":\"/somewhere\"}\n").unwrap();

        let saved = read_settings(&file).unwrap().unwrap();

        assert_eq!(saved.alignment_target, None);
        assert_eq!(alignment_target(saved.alignment_target), 80);
        assert_eq!(alignment_target(Some(60)), 60);
        assert_eq!(alignment_target(Some(0)), 0);
        assert_eq!(alignment_target(Some(250)), 100);
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
    fn a_profile_is_trimmed_and_a_blank_field_falls_back_to_git() {
        let mut settings = Settings::default();

        apply_profile(&mut settings, Some("  Sid  ".into()), Some("   ".into())).unwrap();

        assert_eq!(settings.name.as_deref(), Some("Sid"));
        assert_eq!(settings.email, None);
        let id = resolve_identity(settings.name, settings.email, None, Some("git@example.com".into()));
        assert_eq!(id.email, "git@example.com");
    }

    #[test]
    fn an_email_needs_text_on_both_sides_of_an_at_and_no_spaces() {
        for bad in ["sid", "@hypotenuse.ai", "sid@", "sid @hypotenuse.ai", "sid@hypo tenuse.ai"] {
            let mut settings = Settings::default();
            assert!(
                apply_profile(&mut settings, None, Some(bad.into())).is_err(),
                "{bad} was accepted"
            );
            assert_eq!(settings.email, None, "{bad} was stored");
        }
        let mut settings = Settings::default();
        apply_profile(&mut settings, None, Some(" sid@hypotenuse.ai ".into())).unwrap();
        assert_eq!(settings.email.as_deref(), Some("sid@hypotenuse.ai"));
    }

    #[test]
    fn a_saved_picture_replaces_the_one_before_it() {
        let dir = temp_dir("openplan-core-settings-avatar-save");
        let picked = dir.join("Me.PNG");
        std::fs::write(&picked, b"new").unwrap();
        std::fs::write(dir.join("avatar-100.jpg"), b"old").unwrap();
        std::fs::write(dir.join("settings.json"), b"{}").unwrap();

        let name = save_avatar(&dir, &picked, "200").unwrap();

        assert_eq!(name, "avatar-200.png");
        assert_eq!(std::fs::read(dir.join(&name)).unwrap(), b"new");
        assert!(!dir.join("avatar-100.jpg").exists(), "the old picture stayed");
        assert!(dir.join("settings.json").exists());
        assert!(picked.exists(), "the chosen file was moved, not copied");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_picture_must_be_an_image_of_five_megabytes_or_less() {
        let dir = temp_dir("openplan-core-settings-avatar-refuse");
        let text = dir.join("notes.txt");
        std::fs::write(&text, b"hello").unwrap();
        let big = dir.join("big.webp");
        std::fs::File::create(&big)
            .unwrap()
            .set_len(AVATAR_MAX_BYTES + 1)
            .unwrap();
        std::fs::write(dir.join("avatar-100.gif"), b"old").unwrap();

        assert!(save_avatar(&dir, &text, "200").is_err());
        assert!(save_avatar(&dir, &big, "200").unwrap_err().contains("5 MB"));
        assert!(dir.join("avatar-100.gif").exists(), "a refused picture removed the old one");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn removing_the_picture_deletes_its_file() {
        let dir = temp_dir("openplan-core-settings-avatar-remove");
        std::fs::write(dir.join("avatar-100.jpeg"), b"old").unwrap();
        std::fs::write(dir.join("settings.json"), b"{}").unwrap();

        remove_avatars(&dir).unwrap();

        assert!(!dir.join("avatar-100.jpeg").exists());
        assert!(dir.join("settings.json").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_picture_is_shown_only_while_its_file_exists() {
        let dir = temp_dir("openplan-core-settings-avatar-path");
        std::fs::write(dir.join("avatar-100.png"), b"me").unwrap();

        assert_eq!(avatar_path(&dir, Some("avatar-100.png")), Some(dir.join("avatar-100.png")));
        assert_eq!(avatar_path(&dir, Some("avatar-999.png")), None);
        assert_eq!(avatar_path(&dir, None), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_name_without_an_email_still_gets_an_identity() {
        let id = resolve_identity(Some("Sid".into()), None, None, None);
        assert_eq!(id.name, "Sid");
        assert_eq!(id.email, "user@openplan.local");
    }

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
            media: Some(true),
            wake: Some(false),
            archive_after_days: Some(0),
            alignment_target: Some(65),
            avatar: Some("avatar-100.png".to_string()),
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

        sync_base(&resolve_base(&file, &home).unwrap()).unwrap();

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

        sync_base(&resolve_base(&dir.join("settings.json"), &home).unwrap()).unwrap();

        assert!(standards.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolving_the_base_records_nothing_until_it_is_asked_to() {
        let dir = temp_dir("openplan-core-settings-resolve-is-quiet");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");

        let base = resolve_base(&file, &home).unwrap();
        std::fs::write(base.plans_dir().join("outside.md"), "# Filed elsewhere").unwrap();
        resolve_base(&file, &home).unwrap();

        assert!(!repo::has_commits(&base.root), "resolving committed the base");
        sync_base(&base).unwrap();
        assert!(repo::has_commits(&base.root));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn several_callers_can_resolve_the_base_at_once() {
        // What the interface does at first paint: every pane asks for the
        // base at the same moment. Resolving used to commit, and the commits
        // collided on git's index lock.
        let dir = temp_dir("openplan-core-settings-at-once");
        let home = dir.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let file = dir.join("settings.json");
        let base = resolve_base(&file, &home).unwrap();
        std::fs::write(base.plans_dir().join("outside.md"), "# Filed elsewhere").unwrap();

        let failures: Vec<String> = std::thread::scope(|scope| {
            let started: Vec<_> = (0..8)
                .map(|_| scope.spawn(|| resolve_base(&file, &home)))
                .collect();
            started
                .into_iter()
                .filter_map(|handle| handle.join().unwrap().err())
                .collect()
        });

        assert!(failures.is_empty(), "{failures:?}");
        assert!(!repo::has_commits(&base.root), "resolving committed the base");
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
