//! The MCP server agents spawn: newline-delimited JSON-RPC over stdio.
//!
//! Implemented directly rather than through an SDK: the protocol at this size
//! is an initialize handshake, a tool list, and a dispatch — a synchronous
//! loop over stdin covers it without an async runtime. Worth revisiting if
//! the surface grows past tools.

use openplan_core::base::Base;
use openplan_core::import::iso_from_unix;
use openplan_core::plan::{self, slugify, Plan, PlanMeta, Status};
use openplan_core::repo::{self, Author};
use openplan_core::{fs, library, settings, standards};
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
                    "project": { "type": "string", "description": "The repo or context the plan belongs to" }
                },
                "required": ["title", "body"]
            }
        },
        {
            "name": "list_plans",
            "description": "The plans in the user's plan base, with status and id.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "status": { "type": "string", "description": "Only this status (draft, in-review, approved, in-progress, done, archived)" }
                }
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
    let filed = Plan {
        meta: PlanMeta {
            id: id.clone(),
            title: title.trim().to_string(),
            status: Status::Draft,
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
        &Author::agent(author),
        &format!("agent({author}): create {id}"),
    ) {
        return text_result(e, true);
    }
    text_result(format!("Filed as {id} (status: draft)."), false)
}

fn list_plans(base: &Base, args: &Value) -> Value {
    let wanted = match args.get("status").and_then(Value::as_str) {
        Some(raw) => match Status::parse(raw) {
            Some(status) => Some(status),
            None => return text_result(format!("No such status: {raw}"), true),
        },
        None => None,
    };
    let mut entries = library::scan(base);
    entries.retain(|e| wanted.map_or(true, |w| e.meta.status == w));
    if entries.is_empty() {
        return text_result("No plans yet.", false);
    }
    entries.sort_by(|a, b| b.meta.updated.cmp(&a.meta.updated));
    let lines: Vec<String> = entries
        .iter()
        .map(|e| {
            format!(
                "{} [{}] {}",
                e.meta.id,
                e.meta.status.as_str(),
                e.meta.title
            )
        })
        .collect();
    text_result(lines.join("\n"), false)
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
                    "read_plan" => Ok(read_plan(base, &args)),
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
