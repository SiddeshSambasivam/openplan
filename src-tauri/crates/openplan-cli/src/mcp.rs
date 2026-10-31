//! The MCP server agents spawn: newline-delimited JSON-RPC over stdio.
//!
//! Implemented directly rather than through an SDK: the protocol at this size
//! is an initialize handshake, a tool list, and a dispatch — a synchronous
//! loop over stdin covers it without an async runtime. Worth revisiting if
//! the surface grows past tools.

use openplan_core::base::Base;
use openplan_core::import::iso_from_unix;
use openplan_core::plan::{self, slugify, Plan, PlanMeta};
use openplan_core::repo::{self, Author};
use openplan_core::{comments, fs, library, settings, standards};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

const PROTOCOL: &str = "2025-06-18";

/// Who is on the other end, normalised to how plans record their source.
fn author_from_client(client_name: &str) -> String {
    let lower = client_name.to_lowercase();
    for known in ["claude", "codex", "cursor"] {
        if lower.contains(known) {
            return if known == "claude" {
                "claude-code".to_string()
            } else {
                known.to_string()
            };
        }
    }
    if lower.is_empty() {
        "agent".to_string()
    } else {
        lower
    }
}

fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    iso_from_unix(secs)
}

fn tool_list() -> Value {
    json!([
        {
            "name": "create_plan",
            "description": "File a finished plan into the user's plan base. Call get_standards first and follow it. The body is the full markdown of the plan; the title should read as a change, not a topic.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "One line, reading as a change" },
                    "body": { "type": "string", "description": "The plan, as markdown" },
                    "project": { "type": "string", "description": "The repo or context the plan belongs to" },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "Free labels, e.g. [\"search\", \"infra\"]" }
                },
                "required": ["title", "body"]
            }
        },
        {
            "name": "list_plans",
            "description": "The plans in the user's plan base, with id and tags.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tag": { "type": "string", "description": "Only plans carrying this tag" }
                }
            }
        },
        {
            "name": "tag_plan",
            "description": "Replace a plan's tags. Tags are free labels shared by the user and their agents. The tag \"archived\" puts a plan away: the app tucks it into a collapsed group.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["id", "tags"]
            }
        },
        {
            "name": "read_plan",
            "description": "The full text of one plan, by id.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        },
        {
            "name": "get_comments",
            "description": "Open review comments on one plan, with thread ids, quoted text, and line numbers. Call this whenever you work on a plan. Every open thread needs a reply.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        },
        {
            "name": "reply_comment",
            "description": "Reply to one review thread on a plan, as yourself. Always reply in the thread, never only in chat. Keep it to one or two lines: what you changed, or what you decided.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "The plan's id" },
                    "thread_id": { "type": "string" },
                    "text": { "type": "string", "description": "One or two lines. No preamble, no restating the comment." }
                },
                "required": ["id", "thread_id", "text"]
            }
        },
        {
            "name": "resolve_comment",
            "description": "Mark one review thread on a plan as resolved. Do this after addressing it, not instead.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "The plan's id" },
                    "thread_id": { "type": "string" }
                },
                "required": ["id", "thread_id"]
            }
        },
        {
            "name": "get_standards",
            "description": "How plans are written here. Read before writing one.",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ])
}

fn text_result(text: impl Into<String>, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text.into() }], "isError": is_error })
}

fn create_plan(base: &Base, author: &str, args: &Value) -> Value {
    let Some(title) = args.get("title").and_then(Value::as_str).filter(|t| !t.trim().is_empty())
    else {
        return text_result("create_plan needs a title.", true);
    };
    let Some(body) = args.get("body").and_then(Value::as_str).filter(|b| !b.trim().is_empty())
    else {
        return text_result("create_plan needs the plan's markdown body.", true);
    };
    let id = slugify(title);
    let destination = base.plans_dir().join(format!("{id}.md"));
    if destination.exists() {
        return text_result(
            format!("A plan called {id} already exists. Read it with read_plan first."),
            true,
        );
    }
    let now = now_iso();
    let tags = args
        .get("tags")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let filed = Plan {
        meta: PlanMeta {
            id: id.clone(),
            title: title.trim().to_string(),
            tags,
            source: author.to_string(),
            project: args.get("project").and_then(Value::as_str).map(str::to_string),
            created: Some(now.clone()),
            updated: Some(now),
        },
        frontmatter: Vec::new(),
        body: format!("{}\n", body.trim_end()),
        derived: false,
    };
    if let Err(e) = fs::atomic_write(&destination, &plan::serialize(&filed)) {
        return text_result(e, true);
    }
    if let Err(e) = repo::commit_all(
        &base.root,
        &Author::agent_for(author, &openplan_core::settings::current_identity()),
        &format!("agent({author}): create {id}"),
    ) {
        return text_result(e, true);
    }
    text_result(format!("Filed as {id}."), false)
}

fn list_plans(base: &Base, args: &Value) -> Value {
    let mut entries = library::scan(base);
    if let Some(tag) = args.get("tag").and_then(Value::as_str) {
        entries.retain(|e| e.meta.tags.iter().any(|t| t == tag));
    }
    if entries.is_empty() {
        return text_result("No plans yet.", false);
    }
    entries.sort_by(|a, b| b.meta.updated.cmp(&a.meta.updated));
    let lines: Vec<String> = entries
        .iter()
        .map(|e| {
            let tags = if e.meta.tags.is_empty() {
                String::new()
            } else {
                format!(" [{}]", e.meta.tags.join(", "))
            };
            format!("{}{tags} {}", e.meta.id, e.meta.title)
        })
        .collect();
    text_result(lines.join("\n"), false)
}

fn tag_plan(base: &Base, author: &str, args: &Value) -> Value {
    let Some(id) = args.get("id").and_then(Value::as_str) else {
        return text_result("tag_plan needs an id.", true);
    };
    let Some(tags) = args.get("tags").and_then(Value::as_array) else {
        return text_result("tag_plan needs tags, an array of strings.", true);
    };
    let Some(entry) = library::scan(base).into_iter().find(|e| e.meta.id == id) else {
        return text_result(format!("No plan called {id}."), true);
    };
    let text = match fs::read_to_string(&entry.path) {
        Ok(text) => text,
        Err(e) => return text_result(e, true),
    };
    let mut parsed = plan::parse(&text, &entry.path);
    parsed.meta.tags = tags
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect();
    if let Err(e) = fs::atomic_write(&entry.path, &plan::serialize(&parsed)) {
        return text_result(e, true);
    }
    if let Err(e) = repo::commit_all(
        &base.root,
        &Author::agent_for(author, &openplan_core::settings::current_identity()),
        &format!("agent({author}): tag {id}"),
    ) {
        return text_result(e, true);
    }
    text_result(format!("Tagged {id}: {}", parsed.meta.tags.join(", ")), false)
}

fn read_plan(base: &Base, args: &Value) -> Value {
    let Some(id) = args.get("id").and_then(Value::as_str) else {
        return text_result("read_plan needs an id — list_plans shows them.", true);
    };
    match library::scan(base).into_iter().find(|e| e.meta.id == id) {
        Some(entry) => match fs::read_to_string(&entry.path) {
            Ok(text) => text_result(text, false),
            Err(e) => text_result(e, true),
        },
        None => text_result(format!("No plan called {id}. list_plans shows what there is."), true),
    }
}

fn find_entry(base: &Base, args: &Value) -> Result<library::PlanEntry, Value> {
    let Some(id) = args.get("id").and_then(Value::as_str) else {
        return Err(text_result("Which plan? Pass its id.", true));
    };
    library::scan(base)
        .into_iter()
        .find(|e| e.meta.id == id)
        .ok_or_else(|| text_result(format!("No plan called {id}."), true))
}

fn get_comments(base: &Base, args: &Value) -> Value {
    match find_entry(base, args) {
        Ok(entry) => text_result(
            comments::format_for_agent(
                &comments::read_threads(&entry.path),
                &entry.relative_path.display().to_string(),
            ),
            false,
        ),
        Err(reply) => reply,
    }
}

fn reply_comment(base: &Base, author: &str, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let (Some(thread_id), Some(text)) = (
        args.get("thread_id").and_then(Value::as_str),
        args.get("text").and_then(Value::as_str).filter(|t| !t.trim().is_empty()),
    ) else {
        return text_result("reply_comment needs thread_id and text.", true);
    };
    if let Err(e) = comments::reply(
        &entry.path,
        thread_id,
        text,
        author,
        Some(openplan_core::settings::current_identity().email.as_str()),
        &now_iso(),
    ) {
        return text_result(e, true);
    }
    let _ = repo::commit_all(
        &base.root,
        &Author::agent_for(author, &openplan_core::settings::current_identity()),
        &format!("agent({author}): reply on {}", entry.meta.id),
    );
    text_result("Replied.", false)
}

fn resolve_comment(base: &Base, author: &str, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let Some(thread_id) = args.get("thread_id").and_then(Value::as_str) else {
        return text_result("resolve_comment needs a thread_id.", true);
    };
    if let Err(e) = comments::set_resolved(&entry.path, thread_id, true) {
        return text_result(e, true);
    }
    let _ = repo::commit_all(
        &base.root,
        &Author::agent_for(author, &openplan_core::settings::current_identity()),
        &format!("agent({author}): resolve thread on {}", entry.meta.id),
    );
    text_result("Resolved.", false)
}

fn get_standards() -> Value {
    let overrides = settings::settings_path()
        .ok()
        .and_then(|p| settings::read_settings(&p).ok().flatten())
        .and_then(|s| s.standards);
    text_result(standards::effective(overrides.as_deref()), false)
}

/// Serves until stdin closes, which is how the client says the session ended.
pub fn serve(base: &Base, input: impl BufRead, mut output: impl Write) -> Result<(), String> {
    let mut author = "agent".to_string();
    for line in input.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let message: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue, // not JSON-RPC; nothing sensible to answer
        };
        let id = message.get("id").cloned();
        let method = message.get("method").and_then(Value::as_str).unwrap_or("");
        let params = message.get("params").cloned().unwrap_or_else(|| json!({}));

        // Notifications carry no id and get no reply.
        let Some(id) = id else { continue };

        let result: Result<Value, (i64, String)> = match method {
            "initialize" => {
                if let Some(name) = params
                    .get("clientInfo")
                    .and_then(|c| c.get("name"))
                    .and_then(Value::as_str)
                {
                    author = author_from_client(name);
                }
                Ok(json!({
                    "protocolVersion": params.get("protocolVersion").and_then(Value::as_str).unwrap_or(PROTOCOL),
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "openplan", "version": env!("CARGO_PKG_VERSION") }
                }))
            }
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": tool_list() })),
            "tools/call" => {
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
                match name {
                    "create_plan" => Ok(create_plan(base, &author, &args)),
                    "list_plans" => Ok(list_plans(base, &args)),
                    "tag_plan" => Ok(tag_plan(base, &author, &args)),
                    "read_plan" => Ok(read_plan(base, &args)),
                    "get_comments" => Ok(get_comments(base, &args)),
                    "reply_comment" => Ok(reply_comment(base, &author, &args)),
                    "resolve_comment" => Ok(resolve_comment(base, &author, &args)),
                    "get_standards" => Ok(get_standards()),
                    other => Err((-32602, format!("No such tool: {other}"))),
                }
            }
            "resources/list" => Ok(json!({ "resources": [] })),
            "prompts/list" => Ok(json!({ "prompts": [] })),
            other => Err((-32601, format!("Method not found: {other}"))),
        };

        let reply = match result {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err((code, message)) => {
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
            }
        };
        writeln!(output, "{reply}").map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}
