//! Reads the state of a plan's pull requests with the person's GitHub CLI,
//! under their own login, and writes what moved to the work record. Only on
//! the person's word or a session leaving, never on a timer.

use openplan_core::{repo, work};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::Duration;

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct PrRefresh {
    /// PRs the CLI answered for.
    checked: usize,
    /// PRs whose state moved and was written.
    changed: usize,
    /// False when the CLI is missing or signed out, so nothing was read.
    available: bool,
}

#[tauri::command]
pub async fn refresh_pr_state(
    path: String,
    state: tauri::State<'_, crate::plans::BaseState>,
) -> Result<PrRefresh, String> {
    let root = state.get()?.root.clone();
    tauri::async_runtime::spawn_blocking(move || refresh(Path::new(&path), &root, read_with_cli))
        .await
        .map_err(|e| e.to_string())?
}

/// The author the app writes PR states under.
const AUTHOR: &str = "openplan";
/// A GUI app on macOS starts without the shell's PATH, so the usual install
/// places are looked in too: Homebrew's two, then nix's system profile. The
/// nix user profile is added per user.
const FALLBACK_DIRS: [&str; 3] = ["/opt/homebrew/bin", "/usr/local/bin", "/run/current-system/sw/bin"];
/// One CLI call is a network round trip. Past this it is given up on.
const CALL_LIMIT: Duration = Duration::from_secs(5);

/// How the PRs get read: `None` when the CLI cannot be used at all, else
/// the state of each url it answered for.
type Reader = fn(&[String]) -> Option<Vec<(String, work::PrState)>>;

fn refresh(path: &Path, root: &Path, read: Reader) -> Result<PrRefresh, String> {
    let urls: Vec<String> = work::read(path)?
        .map(|record| work::unmerged_prs(&record))
        .unwrap_or_default()
        .into_iter()
        .filter(|url| is_github_pr_url(url))
        .collect();
    if urls.is_empty() {
        return Ok(PrRefresh { checked: 0, changed: 0, available: true });
    }
    let Some(states) = read(&urls) else {
        return Ok(PrRefresh { checked: 0, changed: 0, available: false });
    };
    let changed = write_states(path, &states)?;
    if changed > 0 {
        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("plan");
        let _ = repo::commit_all(root, &repo::Author::app(), &format!("pr state: {name}"));
    }
    Ok(PrRefresh { checked: states.len(), changed, available: true })
}

/// The CLI's own answer for each url, after one sign-in check.
fn read_with_cli(urls: &[String]) -> Option<Vec<(String, work::PrState)>> {
    let cli = find_cli(cli_dirs())?;
    if !signed_in(&cli) {
        return None;
    }
    Some(
        urls.iter()
            .filter_map(|url| Some((url.clone(), read_pr_state(&cli, url)?)))
            .collect(),
    )
}

fn read_pr_state(cli: &Path, url: &str) -> Option<work::PrState> {
    let mut command = cli_command(cli);
    command.args(["pr", "view", url, "--json", "state,isDraft,mergedAt"]);
    let output = run_bounded(command, CALL_LIMIT)?;
    if !output.status.success() {
        return None;
    }
    parse_pr_state(&String::from_utf8_lossy(&output.stdout))
}

fn signed_in(cli: &Path) -> bool {
    let mut command = cli_command(cli);
    command.args(["auth", "status"]);
    run_bounded(command, CALL_LIMIT).is_some_and(|output| output.status.success())
}

/// What `gh pr view --json state,isDraft,mergedAt` prints, as a state.
/// Anything else reads as nothing.
fn parse_pr_state(json: &str) -> Option<work::PrState> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    let merged = value.get("mergedAt").is_some_and(|at| at.as_str().is_some_and(|s| !s.is_empty()));
    let draft = value.get("isDraft").and_then(|d| d.as_bool()).unwrap_or(false);
    match value.get("state")?.as_str()? {
        "MERGED" => Some(work::PrState::Merged),
        _ if merged => Some(work::PrState::Merged),
        "CLOSED" => Some(work::PrState::Closed),
        "OPEN" if draft => Some(work::PrState::Draft),
        "OPEN" => Some(work::PrState::Open),
        _ => None,
    }
}

/// Only `https://github.com/<owner>/<repo>/pull/<n>` is handed to the CLI.
fn is_github_pr_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://github.com/") else {
        return false;
    };
    let name = |part: &str| {
        !part.is_empty()
            && !part.starts_with('.')
            && part.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    };
    match rest.split('/').collect::<Vec<_>>()[..] {
        [owner, repo, "pull", number] => {
            name(owner)
                && name(repo)
                && !number.is_empty()
                && number.chars().all(|c| c.is_ascii_digit())
        }
        _ => false,
    }
}

/// Writes only when a state moved, so a refresh that finds nothing new
/// leaves the record, and the watcher, alone.
fn write_states(path: &Path, states: &[(String, work::PrState)]) -> Result<usize, String> {
    let mut preview = work::read(path)?.unwrap_or_default();
    if work::set_pr_states(&mut preview, states, AUTHOR) == 0 {
        return Ok(0);
    }
    let mut changed = 0;
    work::modify(path, |record| {
        changed = work::set_pr_states(record, states, AUTHOR);
        Ok(())
    })?;
    Ok(changed)
}

fn cli_dirs() -> Vec<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let user = std::env::var("USER").ok();
    std::env::split_paths(&path)
        .chain(FALLBACK_DIRS.iter().map(PathBuf::from))
        .chain(user.map(|user| PathBuf::from(format!("/etc/profiles/per-user/{user}/bin"))))
        .collect()
}

fn find_cli(dirs: Vec<PathBuf>) -> Option<PathBuf> {
    dirs.into_iter().map(|dir| dir.join("gh")).find(|path| path.is_file())
}

/// The CLI with no prompt and no update notice, so it only ever prints the
/// answer.
fn cli_command(cli: &Path) -> Command {
    let mut command = Command::new(cli);
    command
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    command
}

/// Runs the command, killing it past `limit`. `None` when it could not
/// start or ran too long.
fn run_bounded(mut command: Command, limit: Duration) -> Option<Output> {
    use std::io::Read;
    let mut child = command.spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let _ = stdout.read_to_end(&mut out);
        let _ = tx.send(out);
    });
    match rx.recv_timeout(limit) {
        Ok(stdout) => {
            let status = child.wait().ok()?;
            Some(Output { status, stdout, stderr: Vec::new() })
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use work::PrState;

    #[test]
    fn reads_each_state_the_cli_prints() {
        let read = |json: &str| parse_pr_state(json);

        assert_eq!(
            read(r#"{"isDraft":false,"mergedAt":"2026-10-30T12:00:00Z","state":"MERGED"}"#),
            Some(PrState::Merged)
        );
        assert_eq!(read(r#"{"isDraft":false,"mergedAt":null,"state":"OPEN"}"#), Some(PrState::Open));
        assert_eq!(read(r#"{"isDraft":true,"mergedAt":null,"state":"OPEN"}"#), Some(PrState::Draft));
        assert_eq!(read(r#"{"isDraft":false,"mergedAt":null,"state":"CLOSED"}"#), Some(PrState::Closed));
    }

    #[test]
    fn reads_nothing_from_output_it_does_not_know() {
        assert_eq!(parse_pr_state("not json"), None);
        assert_eq!(parse_pr_state(""), None);
        assert_eq!(parse_pr_state(r#"{"state":"LOCKED"}"#), None);
        assert_eq!(parse_pr_state(r#"{"isDraft":false}"#), None);
        assert_eq!(parse_pr_state(r#"[1,2]"#), None);
    }

    #[test]
    fn hands_the_cli_only_a_github_pull_request_url() {
        assert!(is_github_pr_url("https://github.com/owner/repo/pull/12"));
        assert!(is_github_pr_url("https://github.com/my-org/my.repo_2/pull/1"));
        for url in [
            "http://github.com/owner/repo/pull/12",
            "https://github.com/owner/repo/pull/12/files",
            "https://github.com/owner/repo/issues/12",
            "https://github.com/owner/repo/pull/",
            "https://github.com/owner/repo/pull/1x",
            "https://gitlab.com/owner/repo/-/merge_requests/3",
            "https://github.com/../repo/pull/1",
            "https://github.com/owner/repo/pull/1?x=--web",
            "https://github.com.evil.com/owner/repo/pull/1",
            "--web",
        ] {
            assert!(!is_github_pr_url(url), "{url}");
        }
    }

    #[test]
    fn finds_the_cli_in_the_first_folder_that_has_it() {
        let root = std::env::temp_dir().join("openplan-app-find-cli");
        let _ = std::fs::remove_dir_all(&root);
        let (empty, homebrew) = (root.join("bin"), root.join("homebrew"));
        std::fs::create_dir_all(&empty).unwrap();
        std::fs::create_dir_all(&homebrew).unwrap();
        std::fs::write(homebrew.join("gh"), "").unwrap();

        assert_eq!(find_cli(vec![empty.clone(), homebrew.clone()]), Some(homebrew.join("gh")));
        assert_eq!(find_cli(vec![empty]), None);
        let dirs = cli_dirs();
        assert!(FALLBACK_DIRS.iter().all(|dir| dirs.contains(&PathBuf::from(dir))));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_call_past_its_limit_is_given_up_on() {
        let mut slow = Command::new("sleep");
        slow.arg("5").stdout(std::process::Stdio::piped());

        let started = std::time::Instant::now();
        assert!(run_bounded(slow, Duration::from_millis(100)).is_none());
        assert!(started.elapsed() < Duration::from_secs(2));

        let mut quick = Command::new("echo");
        quick.arg("hi").stdout(std::process::Stdio::piped());
        assert_eq!(run_bounded(quick, CALL_LIMIT).unwrap().stdout, b"hi\n");
    }

    fn plan_with_prs(name: &str, prs: &[(&str, &str)]) -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("plan.md");
        std::fs::write(&path, "# Plan\n").unwrap();
        let prs: Vec<serde_json::Value> = prs
            .iter()
            .map(|(url, state)| {
                serde_json::json!({
                    "url": url, "state": state, "checks": "passing", "review": "approved",
                    "reportedAt": "2026-10-28T00:00:00Z", "by": "claude-code"
                })
            })
            .collect();
        let record: work::WorkRecord = serde_json::from_value(serde_json::json!({ "prs": prs })).unwrap();
        work::write(&path, &record).unwrap();
        (root, path)
    }

    const OPEN: &str = "https://github.com/o/r/pull/1";
    const MERGED: &str = "https://github.com/o/r/pull/2";

    #[test]
    fn a_pr_merged_since_the_agent_reported_is_written_as_the_app() {
        let (root, path) = plan_with_prs("openplan-app-refresh-merged", &[(OPEN, "open"), (MERGED, "merged")]);
        fn merged_all(urls: &[String]) -> Option<Vec<(String, PrState)>> {
            assert_eq!(urls, [OPEN]);
            Some(urls.iter().map(|u| (u.clone(), PrState::Merged)).collect())
        }

        let refreshed = refresh(&path, &root, merged_all).unwrap();

        assert_eq!(refreshed, PrRefresh { checked: 1, changed: 1, available: true });
        let record = work::read(&path).unwrap().unwrap();
        assert_eq!((record.prs[0].state, record.prs[0].by.as_str()), (PrState::Merged, "openplan"));
        assert!(work::all_prs_merged(&record));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn nothing_new_leaves_the_record_untouched() {
        let (root, path) = plan_with_prs("openplan-app-refresh-same", &[(OPEN, "open")]);
        let before = std::fs::read_to_string(work::work_path(&path).unwrap()).unwrap();
        fn still_open(urls: &[String]) -> Option<Vec<(String, PrState)>> {
            Some(urls.iter().map(|u| (u.clone(), PrState::Open)).collect())
        }

        let refreshed = refresh(&path, &root, still_open).unwrap();

        assert_eq!(refreshed, PrRefresh { checked: 1, changed: 0, available: true });
        assert_eq!(std::fs::read_to_string(work::work_path(&path).unwrap()).unwrap(), before);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn without_the_cli_nothing_is_read_or_written() {
        let (root, path) = plan_with_prs("openplan-app-refresh-no-cli", &[(OPEN, "open")]);
        fn missing(_: &[String]) -> Option<Vec<(String, PrState)>> {
            None
        }

        let refreshed = refresh(&path, &root, missing).unwrap();

        assert_eq!(refreshed, PrRefresh { checked: 0, changed: 0, available: false });
        assert_eq!(work::read(&path).unwrap().unwrap().prs[0].state, PrState::Open);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_plan_with_nothing_to_read_never_asks_the_cli() {
        let (root, path) = plan_with_prs(
            "openplan-app-refresh-nothing",
            &[(MERGED, "merged"), ("https://gitlab.com/o/r/-/merge_requests/3", "open")],
        );
        fn never(_: &[String]) -> Option<Vec<(String, PrState)>> {
            panic!("the CLI was asked")
        }

        let refreshed = refresh(&path, &root, never).unwrap();

        assert_eq!(refreshed, PrRefresh { checked: 0, changed: 0, available: true });
        let _ = std::fs::remove_dir_all(&root);
    }
}
