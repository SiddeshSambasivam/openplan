//! Connecting agent tools to the base: registering the MCP server each one
//! spawns, and telling each one — in its own instruction file — that plans
//! belong in OpenPlan.
//!
//! Everything written into a file someone else owns lives inside one marked
//! block, so installing twice replaces rather than repeats, and uninstalling
//! is deleting the block.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Marks the section these installers own, so everything a person wrote
/// around it survives. A dev build owns a different section than the
/// installed app, and the two sit side by side.
pub fn block_begin() -> String {
    format!("<!-- BEGIN {} -->", crate::profile::name().to_uppercase())
}

pub fn block_end() -> String {
    format!("<!-- END {} -->", crate::profile::name().to_uppercase())
}

/// One thing an install did, in words a person can check.
#[derive(Debug, Clone, PartialEq)]
pub struct Step {
    pub label: String,
    pub done: bool,
    pub detail: String,
}

fn step(label: impl Into<String>, done: bool, detail: impl Into<String>) -> Step {
    Step {
        label: label.into(),
        done,
        detail: detail.into(),
    }
}

/// Replaces this tool's block if the file already carries one, appends it if
/// not, and leaves every other line exactly alone.
pub fn upsert_block(text: &str, content: &str) -> String {
    let (begin_marker, end_marker) = (block_begin(), block_end());
    let block = format!("{begin_marker}\n{content}\n{end_marker}");
    if let (Some(begin), Some(end)) = (text.find(&begin_marker), text.find(&end_marker)) {
        if end > begin {
            let after = &text[end + end_marker.len()..];
            return format!("{}{}{}", &text[..begin], block, after);
        }
    }
    if text.trim().is_empty() {
        format!("{block}\n")
    } else {
        format!("{}\n\n{block}\n", text.trim_end())
    }
}

/// What every agent is told, wherever its instruction file lives.
pub fn conventions() -> String {
    format!("## Plans belong in OpenPlan

Plans are managed by the `{}` MCP server, not by loose files.

- Before writing a plan, call `get_standards` and follow it.
- When a plan is agreed, file it with `create_plan` (title + full markdown
  body). Do not leave it only in the conversation.
- To see or reread existing plans, use `list_plans` and `read_plan` rather
  than searching the filesystem for them.
- Comments are how people review plans. Call `get_comments` whenever you
  work on one, and answer every open thread with `reply_comment`. Always
  reply in the thread, not only in chat.
- Keep each reply to one or two lines: what you changed, or what you
  decided. Call `resolve_comment` once you have acted on it.",
        crate::profile::name()
    )
}

fn upsert_block_in_file(path: &Path, content: &str, dry_run: bool) -> Result<Step, String> {
    if dry_run {
        return Ok(step(
            &format!("Update {}", path.display()),
            true,
            "would add the OpenPlan block",
        ));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Couldn't create {}: {e}", parent.display()))?;
    }
    let existing = std::fs::read_to_string(path).unwrap_or_default();
    let updated = upsert_block(&existing, content);
    let changed = updated != existing;
    crate::fs::atomic_write(path, &updated)?;
    Ok(step(
        &format!("Update {}", path.display()),
        true,
        if changed { "written" } else { "already current" },
    ))
}

fn find_claude(home: &Path) -> Option<PathBuf> {
    let candidates = [
        home.join(".claude/local/claude"),
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
        home.join(".local/bin/claude"),
    ];
    candidates.into_iter().find(|p| p.is_file()).or_else(|| {
        // Fall back to PATH, which covers a shell install the list misses.
        Command::new("which")
            .arg("claude")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| PathBuf::from(String::from_utf8_lossy(&o.stdout).trim().to_string()))
            .filter(|p| p.is_file())
    })
}

/// Claude Code: register the server with its own CLI (its config file also
/// carries unrelated per-project state, so it stays Claude's to write), and
/// add the conventions to the global CLAUDE.md.
pub fn install_claude_code(home: &Path, cli: &Path, dry_run: bool) -> Result<Vec<Step>, String> {
    let mut steps = Vec::new();
    let server = format!(
        "{{\"type\":\"stdio\",\"command\":\"{}\",\"args\":[\"mcp\"]}}",
        cli.display()
    );
    if dry_run {
        steps.push(step(
            format!("Register the {} MCP server", crate::profile::name()),
            true,
            format!(
                "would run: claude mcp add-json {} '{server}' --scope user",
                crate::profile::name()
            ),
        ));
    } else {
        let Some(claude) = find_claude(home) else {
            return Err("Couldn't find the `claude` command on this machine.".to_string());
        };
        let output = Command::new(&claude)
            .args(["mcp", "add-json", &crate::profile::name(), &server, "--scope", "user"])
            .output()
            .map_err(|e| format!("Couldn't run {}: {e}", claude.display()))?;
        let stderr = String::from_utf8_lossy(&output.stderr);
        if output.status.success() {
            steps.push(step(format!("Register the {} MCP server", crate::profile::name()), true, "registered"));
        } else if stderr.contains("already exists") {
            steps.push(step(
                format!("Register the {} MCP server", crate::profile::name()),
                true,
                "already registered",
            ));
        } else {
            return Err(format!("claude mcp add-json failed: {}", stderr.trim()));
        }
    }
    steps.push(upsert_block_in_file(
        &home.join(".claude").join("CLAUDE.md"),
        &conventions(),
        dry_run,
    )?);
    Ok(steps)
}

/// Codex: its config is a TOML file of MCP servers, and its instructions are
/// a global AGENTS.md.
pub fn install_codex(home: &Path, cli: &Path) -> Result<Vec<Step>, String> {
    let config = home.join(".codex").join("config.toml");
    let existing = std::fs::read_to_string(&config).unwrap_or_default();
    let mut steps = Vec::new();
    let section = format!("[mcp_servers.{}]", crate::profile::name());
    if existing.contains(&section) {
        steps.push(step(
            format!("Register the {} MCP server", crate::profile::name()),
            true,
            "already registered",
        ));
    } else {
        if let Some(parent) = config.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Couldn't create {}: {e}", parent.display()))?;
        }
        let entry = format!(
            "\n{section}\ncommand = \"{}\"\nargs = [\"mcp\"]\n",
            cli.display()
        );
        crate::fs::atomic_write(&config, &format!("{}{}", existing, entry))?;
        steps.push(step(format!("Register the {} MCP server", crate::profile::name()), true, "registered"));
    }
    steps.push(upsert_block_in_file(
        &home.join(".codex").join("AGENTS.md"),
        &conventions(),
        false,
    )?);
    Ok(steps)
}

/// Cursor: a JSON file of MCP servers. Other entries in it are preserved.
pub fn install_cursor(home: &Path, cli: &Path) -> Result<Vec<Step>, String> {
    let config = home.join(".cursor").join("mcp.json");
    let mut root: serde_json::Value = std::fs::read_to_string(&config)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let servers = root
        .as_object_mut()
        .ok_or("~/.cursor/mcp.json isn't a JSON object.")?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));
    let already = servers.get(&crate::profile::name()).is_some();
    servers.as_object_mut().ok_or("mcpServers isn't an object.")?.insert(
        crate::profile::name(),
        serde_json::json!({ "command": cli.display().to_string(), "args": ["mcp"] }),
    );
    if let Some(parent) = config.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Couldn't create {}: {e}", parent.display()))?;
    }
    crate::fs::atomic_write(
        &config,
        &format!("{}\n", serde_json::to_string_pretty(&root).unwrap()),
    )?;
    Ok(vec![step(
        format!("Register the {} MCP server", crate::profile::name()),
        true,
        if already { "already registered" } else { "registered" },
    )])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_block_is_appended_once_and_replaced_thereafter() {
        let first = upsert_block("# My own instructions\n", "plans go to openplan");

        assert!(first.starts_with("# My own instructions"));
        assert!(first.contains("plans go to openplan"));

        let second = upsert_block(&first, "revised conventions");

        assert!(second.contains("revised conventions"));
        assert!(!second.contains("plans go to openplan"), "old block left behind");
        assert_eq!(second.matches(&block_begin()).count(), 1);
    }

    #[test]
    fn what_someone_wrote_around_the_block_is_untouched() {
        let text = format!(
            "before\n\n{}\nold\n{}\n\nafter\n",
            block_begin(),
            block_end()
        );

        let updated = upsert_block(&text, "new");

        assert!(updated.starts_with("before\n"));
        assert!(updated.trim_end().ends_with("after"));
        assert!(updated.contains("new"));
    }

    #[test]
    fn a_dev_build_leaves_the_installed_apps_block_alone() {
        // The two builds own separately marked sections, so working on
        // OpenPlan cannot rewrite the rules the installed app put there.
        let installed = "<!-- BEGIN OPENPLAN -->\nthe installed rules\n<!-- END OPENPLAN -->";
        let text = format!("before\n\n{installed}\n\nafter\n");

        let updated = upsert_block(&text, "the dev rules");

        assert!(updated.contains(installed), "installed block survives");
        assert!(updated.contains("the dev rules"));
        assert!(updated.contains(&block_begin()));
    }

    #[test]
    fn a_dry_run_writes_nothing_and_says_what_it_would_do() {
        let home = temp_home("openplan-core-int-claude");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude/CLAUDE.md"), "# Sid's rules\n").unwrap();

        let steps =
            install_claude_code(&home, Path::new("/usr/local/bin/openplan"), true).unwrap();

        let md = std::fs::read_to_string(home.join(".claude/CLAUDE.md")).unwrap();
        assert_eq!(md, "# Sid's rules\n", "a dry run wrote to their file");
        assert!(steps.iter().any(|s| s.detail.contains("claude mcp add-json")));
        assert!(steps.iter().any(|s| s.detail.contains("would add")));

        install_claude_code(&home, Path::new("/usr/local/bin/openplan"), true).unwrap();
        let wet = std::fs::read_to_string(home.join(".claude/CLAUDE.md")).unwrap();
        assert!(wet.starts_with("# Sid's rules"), "their own text must survive");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn installing_for_codex_is_idempotent() {
        let home = temp_home("openplan-core-int-codex");
        let cli = Path::new("/usr/local/bin/openplan");

        install_codex(&home, cli).unwrap();
        let steps = install_codex(&home, cli).unwrap();

        let config = std::fs::read_to_string(home.join(".codex/config.toml")).unwrap();
        assert_eq!(config.matches(&format!("[mcp_servers.{}]", crate::profile::name())).count(), 1);
        assert!(steps[0].detail.contains("already"));
        let agents = std::fs::read_to_string(home.join(".codex/AGENTS.md")).unwrap();
        assert_eq!(agents.matches(&block_begin()).count(), 1);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn installing_for_cursor_keeps_the_servers_already_there() {
        let home = temp_home("openplan-core-int-cursor");
        std::fs::create_dir_all(home.join(".cursor")).unwrap();
        std::fs::write(
            home.join(".cursor/mcp.json"),
            "{\"mcpServers\":{\"other\":{\"command\":\"x\"}}}",
        )
        .unwrap();

        install_cursor(&home, Path::new("/usr/local/bin/openplan")).unwrap();

        let raw = std::fs::read_to_string(home.join(".cursor/mcp.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert!(parsed["mcpServers"]["other"].is_object(), "{raw}");
        assert_eq!(parsed["mcpServers"][crate::profile::name()]["args"][0], "mcp");
        let _ = std::fs::remove_dir_all(&home);
    }
}
