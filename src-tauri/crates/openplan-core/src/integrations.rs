//! Connecting agent tools to the base: registering the MCP server each one
//! spawns, and telling each one — in its own instruction file — that plans
//! belong in OpenPlan.
//!
//! Everything written into a file someone else owns lives inside one marked
//! block, so installing twice replaces rather than repeats, and uninstalling
//! is deleting the block. A hook is found again by its exact command.

use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Claude Code's events, each with the shape `openplan pending` answers in:
/// Stop keeps the turn going, and a prompt hook's output becomes context.
const CLAUDE_HOOKS: [(&str, &str); 2] = [("Stop", "stop"), ("UserPromptSubmit", "context")];

/// Cursor's prompt hook can block a prompt but cannot add context, so only
/// its stop hook carries anything.
const CURSOR_HOOKS: [(&str, &str); 1] = [("stop", "stop")];

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
- File a plan with `create_plan`: the title, and the full body in the format
  `get_standards` names. Revise it with `update_plan`. Never file a second
  copy, and never leave a plan only in the conversation.
- To see or reread existing plans, use `list_plans` and `read_plan` rather
  than searching the filesystem for them.
- A plan moves through draft, alignment, in-progress, in-review, completed and
  archived. The app moves a draft to alignment when the person sends the first
  review. You set in-progress after the person presses Build, and in-review
  once no todo is open. Only the person sets completed and archived.
- After you answer a review round, post one to three questions with
  `ask_questions` and end your turn with a one-line pointer to them. Never ask
  in a harness question prompt such as AskUserQuestion, or in a comment.
  Record an answer given in the session with `record_alignment`.
- On Build, answer the comments it carries, post every question left and wait
  for the answers. Then call `add_decisions`, `add_todos`, and `set_status`
  with in-progress.
- Add todos with `add_todos` and move each one with `update_todo` as you work.
  Never replace the list. A comment that asks for new work becomes a todo.
- Before opening a PR, call `pr_body` and paste its text into the description.
  After opening it, call `record_pr`, and again whenever its state changes.
- When every PR is merged, ask the person in the harness to confirm the plan
  is complete. Only the person marks it completed.
- Comments are how people review plans. Call `get_comments` whenever you
  work on one, and answer every open thread with `reply_comment`. Always
  reply in the thread, not only in chat.
- Keep each reply to one or two lines: what you changed, or what you
  decided. Call `resolve_comment` once you have acted on it.
- Write plans, replies, questions, todos, decisions and PR bodies to the
  Writing rules in `get_standards`. No em dashes. Say what the thing does,
  not how it feels. Active voice. One idea per sentence.",
        crate::profile::name()
    )
}

fn upsert_block_in_file(path: &Path, content: &str, dry_run: bool) -> Result<Step, String> {
    if dry_run {
        return Ok(step(
            format!("Update {}", path.display()),
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
        format!("Update {}", path.display()),
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
/// carries unrelated per-repo state, so it stays Claude's to write), and
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
    steps.push(install_claude_hooks(home, cli, dry_run)?);
    Ok(steps)
}

/// What a hook runs. The exact string is how our entries are told apart from
/// everyone else's, so it depends on nothing but the CLI and the event.
pub fn hook_command(cli: &Path, client: &str, format: &str) -> String {
    format!("\"{}\" pending --client {client} --format {format}", cli.display())
}

/// Puts our hooks into a Claude Code settings document, or takes them out.
/// Each one is its own entry, so hooks other tools added stay as they were.
pub fn set_claude_hooks(settings: &mut Value, cli: &Path, present: bool) -> Result<(), String> {
    let hooks = hooks_object(settings)?;
    for (event, format) in CLAUDE_HOOKS {
        let command = hook_command(cli, "claude-code", format);
        let entry = json!({ "hooks": [{ "type": "command", "command": command }] });
        set_entry(hooks, event, &command, entry, present)?;
    }
    Ok(())
}

/// The same for Cursor's `hooks.json`, whose entries carry the command
/// directly.
pub fn set_cursor_hooks(file: &mut Value, cli: &Path, present: bool) -> Result<(), String> {
    let root = file.as_object_mut().ok_or("hooks.json isn't a JSON object.")?;
    root.entry("version").or_insert(json!(1));
    let hooks = hooks_object(file)?;
    for (event, format) in CURSOR_HOOKS {
        let command = hook_command(cli, "cursor", format);
        let entry = json!({ "command": command });
        set_entry(hooks, event, &command, entry, present)?;
    }
    Ok(())
}

/// Adds the Stop and UserPromptSubmit hooks to `~/.claude/settings.json`.
pub fn install_claude_hooks(home: &Path, cli: &Path, dry_run: bool) -> Result<Step, String> {
    let path = home.join(".claude").join("settings.json");
    let label = format!("Add the Stop and UserPromptSubmit hooks to {}", path.display());
    edit_json_file(&path, dry_run, |settings| set_claude_hooks(settings, cli, true))
        .map(|detail| step(label, true, detail))
}

/// Whether each tool's hooks are in place, for `openplan doctor`.
pub fn hooks_installed(home: &Path, cli: &Path) -> [(&'static str, bool); 2] {
    let read = |path: PathBuf| -> Value {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or(Value::Null)
    };
    let claude = read(home.join(".claude").join("settings.json"));
    let cursor = read(home.join(".cursor").join("hooks.json"));
    [
        (
            "claude-code",
            CLAUDE_HOOKS
                .iter()
                .all(|(_, format)| mentions(&claude, &hook_command(cli, "claude-code", format))),
        ),
        (
            "cursor",
            CURSOR_HOOKS
                .iter()
                .all(|(_, format)| mentions(&cursor, &hook_command(cli, "cursor", format))),
        ),
    ]
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
    let already = servers.get(crate::profile::name().as_str()).is_some();
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
    let hooks = home.join(".cursor").join("hooks.json");
    let detail = edit_json_file(&hooks, false, |file| set_cursor_hooks(file, cli, true))?;
    Ok(vec![
        step(
            format!("Register the {} MCP server", crate::profile::name()),
            true,
            if already { "already registered" } else { "registered" },
        ),
        step(
            format!("Add the stop hook to {}", hooks.display()),
            true,
            format!(
                "{detail}. Cursor's prompt hook cannot pass a review on, so between turns it waits for the agent's next tool call"
            ),
        ),
    ])
}

/// Reads a JSON file someone else owns, changes it, and writes it back in
/// their key order. A missing file starts empty. One that does not parse is
/// left alone rather than replaced.
fn edit_json_file(
    path: &Path,
    dry_run: bool,
    change: impl FnOnce(&mut Value) -> Result<(), String>,
) -> Result<&'static str, String> {
    let existing = match std::fs::read_to_string(path) {
        Ok(raw) => Some(raw),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("Couldn't read {}: {e}", path.display())),
    };
    let mut value = match &existing {
        Some(raw) => serde_json::from_str(raw)
            .map_err(|e| format!("{} isn't valid JSON, so it was left alone: {e}", path.display()))?,
        None => json!({}),
    };
    let before = value.clone();
    change(&mut value)?;
    if dry_run {
        return Ok("would add the hooks");
    }
    if value == before {
        return Ok("already current");
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Couldn't create {}: {e}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    crate::fs::atomic_write(path, &format!("{text}\n"))?;
    Ok("written")
}

fn hooks_object(file: &mut Value) -> Result<&mut Map<String, Value>, String> {
    file.as_object_mut()
        .ok_or("The hooks file isn't a JSON object.")?
        .entry("hooks")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| "Its \"hooks\" entry isn't an object.".to_string())
}

/// Takes out every entry that runs `command`, then adds `entry` back when
/// the hook should be present. An event left with no entries goes too.
fn set_entry(
    hooks: &mut Map<String, Value>,
    event: &str,
    command: &str,
    entry: Value,
    present: bool,
) -> Result<(), String> {
    let list = hooks
        .entry(event)
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or_else(|| format!("The {event} hooks aren't a list."))?;
    list.retain(|existing| !mentions(existing, command));
    if present {
        list.push(entry);
    }
    if list.is_empty() {
        hooks.remove(event);
    }
    Ok(())
}

/// Whether any `command` inside this value is exactly the one given.
fn mentions(value: &Value, command: &str) -> bool {
    match value {
        Value::Object(map) => {
            map.get("command").and_then(Value::as_str) == Some(command)
                || map.values().any(|v| mentions(v, command))
        }
        Value::Array(items) => items.iter().any(|v| mentions(v, command)),
        _ => false,
    }
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
    fn the_block_names_the_lifecycle_tools_and_follows_the_writing_rules() {
        let block = conventions();

        assert!(block.lines().count() < 40, "the block is {} lines", block.lines().count());
        assert_eq!(crate::standards::writing_faults(&block), Vec::<String>::new());
        for tool in [
            "update_plan",
            "ask_questions",
            "record_alignment",
            "add_decisions",
            "add_todos",
            "update_todo",
            "pr_body",
            "record_pr",
        ] {
            assert!(block.contains(&format!("`{tool}`")), "the block never names {tool}");
        }
        let flat = block.split_whitespace().collect::<Vec<_>>().join(" ");
        assert!(flat.contains("one to three questions"));
        assert!(flat.contains("On Build,"));
        assert!(flat.contains("Never ask in a harness question prompt such as AskUserQuestion"));
        assert!(!flat.contains("Accept all N recommendations"));
        assert!(!flat.contains("Let the agent decide"));
        assert!(flat.contains("When every PR is merged, ask the person in the harness to confirm"));
    }

    /// Someone's real settings: hooks from another tool on the same events,
    /// and keys in an order they chose.
    const THEIR_SETTINGS: &str = r#"{
  "permissions": { "allow": ["Artifact"] },
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "their-stop.sh", "timeout": 10 } ] }
    ],
    "SessionStart": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "their-start.sh" } ] }
    ]
  },
  "model": "opus"
}"#;

    fn hook_commands(settings: &serde_json::Value, event: &str) -> Vec<String> {
        settings["hooks"][event]
            .as_array()
            .into_iter()
            .flatten()
            .flat_map(|group| group["hooks"].as_array().cloned().unwrap_or_default())
            .map(|hook| hook["command"].as_str().unwrap_or_default().to_string())
            .collect()
    }

    #[test]
    fn claude_hooks_go_in_beside_theirs_and_replace_only_our_own() {
        let cli = Path::new("/Applications/OpenPlan.app/Contents/MacOS/openplan");
        let mut settings: serde_json::Value = serde_json::from_str(THEIR_SETTINGS).unwrap();

        set_claude_hooks(&mut settings, cli, true).unwrap();
        set_claude_hooks(&mut settings, cli, true).unwrap();

        let stop = hook_command(cli, "claude-code", "stop");
        let prompt = hook_command(cli, "claude-code", "context");
        assert_eq!(hook_commands(&settings, "Stop"), ["their-stop.sh".to_string(), stop.clone()]);
        assert_eq!(hook_commands(&settings, "UserPromptSubmit"), [prompt]);
        assert_eq!(hook_commands(&settings, "SessionStart"), ["their-start.sh"]);
        assert_eq!(settings["hooks"]["Stop"][0]["hooks"][0]["timeout"], 10);
        assert_eq!(settings["hooks"]["Stop"][1]["hooks"][0]["type"], "command");
        let keys: Vec<&String> = settings.as_object().unwrap().keys().collect();
        assert_eq!(keys, ["permissions", "hooks", "model"], "their key order");

        set_claude_hooks(&mut settings, cli, false).unwrap();

        assert_eq!(hook_commands(&settings, "Stop"), ["their-stop.sh"]);
        assert!(settings["hooks"].get("UserPromptSubmit").is_none());
        assert_eq!(
            settings,
            serde_json::from_str::<serde_json::Value>(THEIR_SETTINGS).unwrap()
        );
    }

    #[test]
    fn the_hook_command_runs_pending_for_the_client_in_its_shape() {
        let command = hook_command(Path::new("/opt/Open Plan/openplan"), "cursor", "stop");

        assert_eq!(command, "\"/opt/Open Plan/openplan\" pending --client cursor --format stop");
    }

    #[test]
    fn installing_claude_hooks_writes_the_settings_file_and_doctor_sees_them() {
        let home = temp_home("openplan-core-int-claude-hooks");
        let cli = Path::new("/usr/local/bin/openplan");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude/settings.json"), THEIR_SETTINGS).unwrap();
        assert_eq!(hooks_installed(&home, cli), [("claude-code", false), ("cursor", false)]);

        let step = install_claude_hooks(&home, cli, false).unwrap();

        assert!(step.done, "{step:?}");
        let raw = std::fs::read_to_string(home.join(".claude/settings.json")).unwrap();
        let written: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(hook_commands(&written, "Stop").len(), 2, "{raw}");
        assert_eq!(hooks_installed(&home, cli), [("claude-code", true), ("cursor", false)]);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn a_settings_file_that_is_not_json_is_left_alone() {
        let home = temp_home("openplan-core-int-claude-broken");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude/settings.json"), "{ not json").unwrap();

        let err = install_claude_hooks(&home, Path::new("/usr/local/bin/openplan"), false)
            .unwrap_err();

        assert!(err.contains("settings.json"), "{err}");
        let raw = std::fs::read_to_string(home.join(".claude/settings.json")).unwrap();
        assert_eq!(raw, "{ not json");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn a_dry_run_writes_nothing_and_says_what_it_would_do() {
        let home = temp_home("openplan-core-int-claude");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude/CLAUDE.md"), "# Sid's rules\n").unwrap();
        std::fs::write(home.join(".claude/settings.json"), THEIR_SETTINGS).unwrap();

        let steps =
            install_claude_code(&home, Path::new("/usr/local/bin/openplan"), true).unwrap();

        let md = std::fs::read_to_string(home.join(".claude/CLAUDE.md")).unwrap();
        assert_eq!(md, "# Sid's rules\n", "a dry run wrote to their file");
        let settings = std::fs::read_to_string(home.join(".claude/settings.json")).unwrap();
        assert_eq!(settings, THEIR_SETTINGS, "a dry run wrote their settings");
        assert!(steps.iter().any(|s| s.detail.contains("claude mcp add-json")));
        assert!(steps.iter().any(|s| s.detail.contains("would add")));
        assert!(steps.iter().any(|s| s.label.contains("Stop and UserPromptSubmit")), "{steps:?}");

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

    #[test]
    fn installing_for_cursor_adds_a_stop_hook_beside_theirs_once() {
        let home = temp_home("openplan-core-int-cursor-hooks");
        let cli = Path::new("/usr/local/bin/openplan");
        std::fs::create_dir_all(home.join(".cursor")).unwrap();
        std::fs::write(
            home.join(".cursor/hooks.json"),
            r#"{"version":1,"hooks":{"stop":[{"command":"./audit.sh"}],"afterFileEdit":[{"command":"./fmt.sh"}]}}"#,
        )
        .unwrap();

        install_cursor(&home, cli).unwrap();
        install_cursor(&home, cli).unwrap();

        let raw = std::fs::read_to_string(home.join(".cursor/hooks.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["version"], 1);
        let stop: Vec<&str> = parsed["hooks"]["stop"]
            .as_array()
            .unwrap()
            .iter()
            .map(|h| h["command"].as_str().unwrap())
            .collect();
        assert_eq!(stop, ["./audit.sh", hook_command(cli, "cursor", "stop").as_str()]);
        assert_eq!(parsed["hooks"]["afterFileEdit"][0]["command"], "./fmt.sh");
        assert!(hooks_installed(&home, cli).contains(&("cursor", true)));

        let mut file = parsed.clone();
        set_cursor_hooks(&mut file, cli, false).unwrap();
        assert_eq!(file["hooks"]["stop"].as_array().unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&home);
    }
}
