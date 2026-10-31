//! The MCP server agents spawn: newline-delimited JSON-RPC over stdio.
//!
//! Implemented directly rather than through an SDK: the protocol at this size
//! is an initialize handshake, a tool list, and a dispatch — a synchronous
//! loop over stdin covers it without an async runtime. Worth revisiting if
//! the surface grows past tools.

use openplan_core::base::Base;
use openplan_core::import::now_iso;
use openplan_core::local::{self, Event};
use openplan_core::plan::{self, slugify, Plan, PlanMeta, Status};
use openplan_core::repo::{self, Author};
use openplan_core::{comments, fs, library, settings, standards};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::sync::{Arc, Mutex};

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

/// The tools, described for the mode this machine writes plans in. Read at
/// tools/list time so a change in settings reaches the next session.
fn tool_list(authoring: &str) -> Value {
    let (filing, body) = if authoring == "html" {
        (
            "File a finished plan into the user's plan base. Call get_standards first and follow it. The body is one self-contained HTML document: no scripts, no external resources. The title should read as a change, not a topic. A new plan is a draft.",
            "The plan, as one self-contained HTML document",
        )
    } else {
        (
            "File a finished plan into the user's plan base. Call get_standards first and follow it. The body is the full markdown of the plan; the title should read as a change, not a topic. A new plan is a draft.",
            "The plan, as markdown",
        )
    };
    json!([
        {
            "name": "create_plan",
            "description": filing,
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "One line, reading as a change" },
                    "body": { "type": "string", "description": body },
                    "type": { "type": "string", "enum": ["feature", "bug", "migration", "research", "audit"], "description": "What kind of work this is. It decides which sections the plan needs and how the app lays it out." }
                },
                "required": ["title", "body"]
            }
        },
        {
            "name": "list_plans",
            "description": "The plans in the user's plan base, with where each one stands: draft (filed and open for review), alignment (you ask the person your questions and record the answers), in-progress (a session is working on it), in-review (a PR is open and a person is looking), completed (the person said it is done), or archived (done and put away).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["draft", "alignment", "in-progress", "in-review", "completed", "archived"],
                        "description": "Only plans in this state"
                    }
                }
            }
        },
        {
            "name": "set_status",
            "description": "Move a plan along. Set alignment on a draft when the person asks you to align on it. Set in-progress when you start implementing it. Set in-review when you open the pull request. Only the person marks a plan completed or archived, so those values are refused. Never set a status to file a plan away; if a plan is superseded, say so in the new plan's body instead.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "status": { "type": "string", "enum": ["draft", "alignment", "in-progress", "in-review"] }
                },
                "required": ["id", "status"]
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

fn create_plan(base: &Base, author: &str, authoring: &str, args: &Value) -> Value {
    let Some(title) = args.get("title").and_then(Value::as_str).filter(|t| !t.trim().is_empty())
    else {
        return text_result("create_plan needs a title.", true);
    };
    let Some(body) = args.get("body").and_then(Value::as_str).filter(|b| !b.trim().is_empty())
    else {
        return text_result("create_plan needs the plan's body.", true);
    };
    let id = slugify(title);
    let html = authoring == "html";
    let extension = if html { "html" } else { "md" };
    let destination = base.plans_dir().join(format!("{id}.{extension}"));
    // A plan keeps its id whichever format it was written in, so a title is
    // taken even when the mode has changed since it was filed.
    if ["md", "html"].iter().any(|e| base.plans_dir().join(format!("{id}.{e}")).exists()) {
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
            plan_type: args.get("type").and_then(Value::as_str).map(str::to_string),
            source: author.to_string(),
            folders: Vec::new(),
            pr: None,
            created: Some(now.clone()),
            updated: Some(now),
            completed: None,
        },
        frontmatter: Vec::new(),
        body: format!("{}\n", body.trim_end()),
        derived: false,
        html,
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
    let mut reply = format!("Filed as {id}.");
    if let Some(plan_type) = filed.meta.plan_type.as_deref() {
        let missing = standards::missing_sections(plan_type, &filed.body);
        if !missing.is_empty() {
            reply.push_str(&format!(
                " A {plan_type} plan also needs these sections: {}. Add them and file the next revision.",
                missing.join(", ")
            ));
        }
    }
    text_result(reply, false)
}

fn list_plans(base: &Base, args: &Value) -> Value {
    let mut entries = library::scan(base);
    if let Some(wanted) = args.get("status").and_then(Value::as_str) {
        let Some(wanted) = Status::parse(wanted) else {
            return text_result(
                "status must be draft, alignment, in-progress, in-review, completed, or archived.",
                true,
            );
        };
        entries.retain(|e| e.meta.status == wanted);
    }
    if entries.is_empty() {
        return text_result("No plans yet.", false);
    }
    entries.sort_by(|a, b| b.meta.updated.cmp(&a.meta.updated));
    let lines: Vec<String> = entries
        .iter()
        .map(|e| format!("[{}] {} {}", e.meta.status.as_str(), e.meta.id, e.meta.title))
        .collect();
    text_result(lines.join("\n"), false)
}

/// The statuses an agent may set. The person finishes and archives plans,
/// and alignment opens from a draft: past that, going back is theirs too.
fn agent_may_set(from: Status, to: Status) -> Result<(), &'static str> {
    match to {
        Status::Completed | Status::Archived => Err(
            "Only the person marks a plan completed or archived. Set in-review when the PR is open; they take it from there.",
        ),
        Status::Alignment if !matches!(from, Status::Draft | Status::Alignment) => Err(
            "Alignment opens from a draft. Once work has started, the person reopens it from the app.",
        ),
        _ => Ok(()),
    }
}

fn set_status(base: &Base, author: &str, args: &Value) -> Value {
    let Some(id) = args.get("id").and_then(Value::as_str) else {
        return text_result("set_status needs an id.", true);
    };
    let Some(status) = args.get("status").and_then(Value::as_str).and_then(Status::parse) else {
        return text_result("status must be draft, alignment, in-progress, or in-review.", true);
    };
    let Some(entry) = library::scan(base).into_iter().find(|e| e.meta.id == id) else {
        return text_result(format!("No plan called {id}."), true);
    };
    if let Err(refusal) = agent_may_set(entry.meta.status, status) {
        return text_result(refusal, true);
    }
    let text = match fs::read_to_string(&entry.path) {
        Ok(text) => text,
        Err(e) => return text_result(e, true),
    };
    let mut parsed = plan::parse(&text, &entry.path);
    let now = now_iso();
    parsed.meta.set_status(status, &now);
    parsed.meta.updated = Some(now);
    if let Err(e) = fs::atomic_write(&entry.path, &plan::serialize(&parsed)) {
        return text_result(e, true);
    }
    if let Err(e) = repo::commit_all(
        &base.root,
        &Author::agent_for(author, &openplan_core::settings::current_identity()),
        &format!("agent({author}): {} {id}", status.as_str()),
    ) {
        return text_result(e, true);
    }
    text_result(format!("{id} is now {}.", status.as_str()), false)
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
    // The agent signs the close with its own name, the way it signs a reply.
    if let Err(e) = comments::resolve(&entry.path, thread_id, author, &now_iso()) {
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
    text_result(
        standards::effective(settings::current_authoring(), overrides.as_deref()),
        false,
    )
}

/// What the app has sent this session, waiting for somewhere to put it.
type Inbox = Arc<Mutex<Vec<Event>>>;

/// Registers with the app if one is open, and keeps a request held there so
/// anything it sends arrives without being asked for. Silence is the ordinary
/// answer: with no app, every tool works exactly as it does on its own.
fn join(client_name: &str, inbox: &Inbox) -> Option<local::Client> {
    let client = local::connect(client_name)?;
    let polling = client.clone();
    let sink = inbox.clone();
    std::thread::spawn(move || {
        // Each read blocks in the app until there is something to say; an
        // empty answer is how the end of the session arrives.
        while let Some(events) = polling.events() {
            if events.is_empty() {
                return;
            }
            let Ok(mut waiting) = sink.lock() else { return };
            waiting.extend(events);
        }
    });
    Some(client)
}

/// Opening a plan is what says a session is working on it. Filing one is not:
/// a plan stays a draft until somebody picks it up.
fn registers(tool: &str) -> bool {
    matches!(tool, "read_plan" | "get_comments" | "set_status")
}

/// MCP gives a server no way to start a message, so a tool result is the only
/// channel there is for something the person did while the agent was working.
fn news(events: &[Event]) -> String {
    let mut blocks = Vec::new();
    for event in events {
        match event {
            Event::Comments { plan, threads } => {
                let mut block = vec![format!("New comments on {plan} since your last call:")];
                for thread in threads {
                    block.push(format!(
                        "thread {} (lines {}-{}): {:?}",
                        thread.id, thread.line_start, thread.line_end, thread.quote
                    ));
                    block.push(thread.text.clone());
                }
                block.push("Reply in each thread with reply_comment.".to_string());
                blocks.push(block.join("\n"));
            }
            Event::Status { plan, status } => blocks.push(format!("{plan} is now {status}.")),
        }
    }
    blocks.join("\n\n")
}

fn deliver(inbox: &Inbox, reply: &mut Value) {
    let waiting = inbox
        .lock()
        .map(|mut queued| std::mem::take(&mut *queued))
        .unwrap_or_default();
    if waiting.is_empty() {
        return;
    }
    let Some(text) = reply
        .pointer("/content/0/text")
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        return;
    };
    reply["content"][0]["text"] = Value::String(format!("{text}\n\n{}", news(&waiting)));
}

/// Serves until stdin closes, which is how the client says the session ended.
pub fn serve(base: &Base, input: impl BufRead, mut output: impl Write) -> Result<(), String> {
    let mut author = "agent".to_string();
    let mut session: Option<local::Client> = None;
    let inbox: Inbox = Arc::new(Mutex::new(Vec::new()));
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
                if session.is_none() {
                    session = join(&author, &inbox);
                }
                Ok(json!({
                    "protocolVersion": params.get("protocolVersion").and_then(Value::as_str).unwrap_or(PROTOCOL),
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "openplan", "version": env!("CARGO_PKG_VERSION") }
                }))
            }
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": tool_list(settings::current_authoring()) })),
            "tools/call" => {
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
                match name {
                    "create_plan" => Ok(create_plan(base, &author, settings::current_authoring(), &args)),
                    "list_plans" => Ok(list_plans(base, &args)),
                    "set_status" => Ok(set_status(base, &author, &args)),
                    "read_plan" => Ok(read_plan(base, &args)),
                    "get_comments" => Ok(get_comments(base, &args)),
                    "reply_comment" => Ok(reply_comment(base, &author, &args)),
                    "resolve_comment" => Ok(resolve_comment(base, &author, &args)),
                    "get_standards" => Ok(get_standards()),
                    other => Err((-32602, format!("No such tool: {other}"))),
                }
                .map(|mut reply| {
                    if let Some(client) = &session {
                        if registers(name) && reply["isError"] != Value::Bool(true) {
                            if let Some(id) = args.get("id").and_then(Value::as_str) {
                                client.take_plan(id);
                            }
                        }
                    }
                    deliver(&inbox, &mut reply);
                    reply
                })
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
    if let Some(client) = &session {
        client.end();
    }
    Ok(())
}
