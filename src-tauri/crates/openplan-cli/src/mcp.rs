//! The MCP server agents spawn: newline-delimited JSON-RPC over stdio.
//!
//! Implemented directly rather than through an SDK: the protocol at this size
//! is an initialize handshake, a tool list, and a dispatch — a synchronous
//! loop over stdin covers it without an async runtime. Worth revisiting if
//! the surface grows past tools.

use crate::work_tools;
use openplan_core::base::Base;
use openplan_core::import::now_iso;
use openplan_core::library::PlanEntry;
use openplan_core::local::{self, Event};
use openplan_core::plan::{self, slugify, Plan, PlanMeta, Status};
use openplan_core::repo::{self, Author};
use openplan_core::work::{self, TodoState, WorkRecord};
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

/// The tools, described for the mode this machine writes plans in and
/// whether media is on. Read at tools/list time so a change in settings
/// reaches the next session.
fn tool_list(authoring: &str, media: bool) -> Value {
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
    let media = if media {
        " Media is on: a short Remotion explainer or a sandboxed html fence is welcome where it shows how something works. get_standards has the recipe."
    } else {
        " Media is off: add no video and no html fence."
    };
    let mut tools = vec![
        json!({
            "name": "create_plan",
            "description": format!("{filing}{media}"),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "One line, reading as a change" },
                    "body": { "type": "string", "description": body },
                    "type": { "type": "string", "enum": ["feature", "bug", "migration", "research", "audit"], "description": "What kind of work this is. It decides which sections the plan needs and how the app lays it out." },
                    "repos": work_tools::repos_schema()
                },
                "required": ["title", "body"]
            }
        }),
        json!({
            "name": "update_plan",
            "description": "Replace a plan's body with a revised one, keeping its id, status and history. Use it to revise a plan after review instead of filing a second copy. Refused once the plan is completed or archived.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "body": { "type": "string", "description": body }
                },
                "required": ["id", "body"]
            }
        }),
        json!({
            "name": "list_plans",
            "description": "The plans in the user's plan base, with where each one stands, its todos done out of all, and its folders. A status is one of draft (filed and open for review), alignment (you ask the person your questions and record the answers), in-progress (the work is under way), in-review (no todo is open and a person is looking), completed (the person said it is done), or archived (done and put away).",
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
        }),
        json!({
            "name": "set_status",
            "description": "Move a plan along. Set alignment on a draft when the person asks you to align on it. Set in-progress once record_alignment has every answer and add_todos has added the work. Set in-review once no todo is open or doing. Only the person marks a plan completed or archived, so those values are refused. A refusal says which call fixes it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "status": { "type": "string", "enum": ["draft", "alignment", "in-progress", "in-review"] }
                },
                "required": ["id", "status"]
            }
        }),
        json!({
            "name": "read_plan",
            "description": "The full text of one plan, by id.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        }),
        json!({
            "name": "get_comments",
            "description": "Open review comments on one plan, with thread ids, quoted text, and line numbers. Call this whenever you work on a plan. Every open thread needs a reply.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        }),
        json!({
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
        }),
        json!({
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
        }),
        json!({
            "name": "get_standards",
            "description": "How plans are written here, the alignment procedure and its question bank. Read before writing a plan or asking alignment questions.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
    ];
    tools.extend(work_tools::tools());
    Value::Array(tools)
}

pub(crate) fn text_result(text: impl Into<String>, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text.into() }], "isError": is_error })
}

/// Records whatever the tool wrote, as the agent.
pub(crate) fn commit(base: &Base, author: &str, message: &str) -> Result<(), String> {
    repo::commit_all(
        &base.root,
        &Author::agent_for(author, &settings::current_identity()),
        message,
    )
    .map(|_| ())
}

/// Rewrites the plan's status and its `updated` stamp. The body is left as
/// it is.
pub(crate) fn move_plan(entry: &PlanEntry, status: Status) -> Result<(), String> {
    rewrite_plan(entry, |plan, now| plan.meta.set_status(status, now))
}

fn rewrite_plan(entry: &PlanEntry, change: impl FnOnce(&mut Plan, &str)) -> Result<(), String> {
    let text = fs::read_to_string(&entry.path)?;
    let mut parsed = plan::parse(&text, &entry.path);
    let now = now_iso();
    change(&mut parsed, &now);
    parsed.meta.updated = Some(now);
    fs::atomic_write(&entry.path, &plan::serialize(&parsed))
}

/// A plan from before 0.3.0 carries its PR in frontmatter. The first agent
/// write to it copies the PR into the work record.
fn absorb_legacy_pr(entry: &PlanEntry) -> Result<(), String> {
    let Some(url) = &entry.meta.pr else {
        return Ok(());
    };
    work::modify(&entry.path, |record| {
        work::absorb_pr(record, url);
        Ok(())
    })
    .map(|_| ())
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
    let repos = match work_tools::parse_repos(args) {
        Ok(repos) => repos,
        Err(e) => return text_result(e, true),
    };
    let id = slugify(title);
    let html = authoring == "html";
    let extension = if html { "html" } else { "md" };
    let destination = base.plans_dir().join(format!("{id}.{extension}"));
    // A plan keeps its id whichever format it was written in, so a title is
    // taken even when the mode has changed since it was filed.
    if ["md", "html"].iter().any(|e| base.plans_dir().join(format!("{id}.{e}")).exists()) {
        return text_result(
            format!("A plan called {id} already exists. Read it with read_plan, and revise it with update_plan."),
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
    if let Some(repos) = repos {
        if let Err(e) = work::modify(&destination, |record| {
            work::set_repos(record, repos);
            Ok(())
        }) {
            return text_result(e, true);
        }
    }
    if let Err(e) = commit(base, author, &format!("agent({author}): create {id}")) {
        return text_result(e, true);
    }
    let mut reply = format!("Filed as {id}.");
    if let Some(plan_type) = filed.meta.plan_type.as_deref() {
        reply.push_str(&missing_sections_note(plan_type, &filed.body));
    }
    text_result(reply, false)
}

/// A warning, never a refusal: a plan short a section is still worth filing.
fn missing_sections_note(plan_type: &str, body: &str) -> String {
    let missing = standards::missing_sections(plan_type, body);
    if missing.is_empty() {
        return String::new();
    }
    format!(
        " A {plan_type} plan also needs these sections: {}. Add them with update_plan.",
        missing.join(", ")
    )
}

fn update_plan(base: &Base, author: &str, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let Some(body) = args.get("body").and_then(Value::as_str).filter(|b| !b.trim().is_empty())
    else {
        return text_result("update_plan needs the revised body.", true);
    };
    let id = &entry.meta.id;
    if matches!(entry.meta.status, Status::Completed | Status::Archived) {
        return text_result(
            format!(
                "{id} is {}, so its text stays as the person accepted it. File new work with create_plan.",
                entry.meta.status.as_str()
            ),
            true,
        );
    }
    let revised = format!("{}\n", body.trim_end());
    let written = rewrite_plan(&entry, |plan, _| plan.body = revised.clone())
        .and_then(|()| absorb_legacy_pr(&entry))
        .and_then(|()| commit(base, author, &format!("agent({author}): update {id}")));
    if let Err(e) = written {
        return text_result(e, true);
    }
    let mut reply = format!("Updated {id}.");
    if let Some(plan_type) = entry.meta.plan_type.as_deref() {
        reply.push_str(&missing_sections_note(plan_type, &revised));
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
    let lines: Vec<String> = entries.iter().map(listing_line).collect();
    text_result(lines.join("\n"), false)
}

/// `[status] id title`, then the todos done out of all and the folders when
/// there are any.
fn listing_line(entry: &PlanEntry) -> String {
    let meta = &entry.meta;
    let mut line = format!("[{}] {} {}", meta.status.as_str(), meta.id, meta.title);
    let record = work::read(&entry.path).ok().flatten().unwrap_or_default();
    let (done, total) = work::progress(&record);
    if total > 0 {
        line.push_str(&format!(" · todos {done}/{total}"));
    }
    if !meta.folders.is_empty() {
        line.push_str(&format!(" · folders {}", meta.folders.join(", ")));
    }
    line
}

/// Whether the agent may move a plan from `from` to `to`, given its work
/// record. The person finishes and archives plans, and alignment opens from
/// a draft. Every refusal names the call that fixes it.
pub(crate) fn guard(from: Status, to: Status, record: &WorkRecord) -> Result<(), String> {
    match to {
        Status::Completed | Status::Archived => Err(
            "Only the person marks a plan completed or archived. Set in-review when no todo is open, and they take it from there.".to_string(),
        ),
        Status::Alignment if !matches!(from, Status::Draft | Status::Alignment) => Err(
            "Alignment opens from a draft. Once work has started, the person reopens it from the app.".to_string(),
        ),
        Status::InProgress => match (work::is_aligned(record), record.todos.is_empty()) {
            (false, true) => Err("The plan has no recorded alignment and no todos. Call record_alignment with every answer, then add_todos.".to_string()),
            (false, false) => Err("The plan has no recorded alignment. Call record_alignment with every question and its answer.".to_string()),
            (true, true) => Err("The plan has no todos. Call add_todos with the work.".to_string()),
            (true, false) => Ok(()),
        },
        Status::InReview if work::open_todos(record) > 0 => {
            let open: Vec<String> = record
                .todos
                .iter()
                .filter(|t| matches!(t.state, TodoState::Open | TodoState::Doing))
                .map(|t| format!("{} ({})", t.id, t.text))
                .collect();
            Err(format!(
                "{} still open: {}. Call update_todo with done for each, or with dropped and a reason.",
                if open.len() == 1 { "One todo is".to_string() } else { format!("{} todos are", open.len()) },
                open.join(", ")
            ))
        }
        _ => Ok(()),
    }
}

fn set_status(base: &Base, author: &str, args: &Value) -> Value {
    let Some(status) = args.get("status").and_then(Value::as_str).and_then(Status::parse) else {
        return text_result("status must be draft, alignment, in-progress, or in-review.", true);
    };
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let record = match work::read(&entry.path) {
        Ok(record) => record.unwrap_or_default(),
        Err(e) => return text_result(e, true),
    };
    if let Err(refusal) = guard(entry.meta.status, status, &record) {
        return text_result(refusal, true);
    }
    let id = &entry.meta.id;
    let written = move_plan(&entry, status)
        .and_then(|()| absorb_legacy_pr(&entry))
        .and_then(|()| commit(base, author, &format!("agent({author}): {} {id}", status.as_str())));
    match written {
        Ok(()) => text_result(format!("{id} is now {}.", status.as_str()), false),
        Err(e) => text_result(e, true),
    }
}

fn read_plan(base: &Base, args: &Value) -> Value {
    let Some(id) = args.get("id").and_then(Value::as_str) else {
        return text_result("read_plan needs an id. list_plans shows them.", true);
    };
    match library::scan(base).into_iter().find(|e| e.meta.id == id) {
        Some(entry) => match fs::read_to_string(&entry.path) {
            Ok(text) => text_result(text, false),
            Err(e) => text_result(e, true),
        },
        None => text_result(format!("No plan called {id}. list_plans shows what there is."), true),
    }
}

pub(crate) fn find_entry(base: &Base, args: &Value) -> Result<PlanEntry, Value> {
    let Some(id) = args.get("id").and_then(Value::as_str) else {
        return Err(text_result("Which plan? Pass its id.", true));
    };
    library::scan(base)
        .into_iter()
        .find(|e| e.meta.id == id)
        .ok_or_else(|| text_result(format!("No plan called {id}. list_plans shows what there is."), true))
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
        Some(settings::current_identity().email.as_str()),
        &now_iso(),
    ) {
        return text_result(e, true);
    }
    let _ = commit(base, author, &format!("agent({author}): reply on {}", entry.meta.id));
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
    let _ = commit(base, author, &format!("agent({author}): resolve thread on {}", entry.meta.id));
    text_result("Resolved.", false)
}

fn get_standards() -> Value {
    let overrides = settings::settings_path()
        .ok()
        .and_then(|p| settings::read_settings(&p).ok().flatten())
        .and_then(|s| s.standards);
    text_result(
        standards::effective_with_media(
            settings::current_authoring(),
            settings::current_media(),
            overrides.as_deref(),
        ),
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

/// The plan a successful call worked on, which is what puts this session on
/// it. Filing counts: the session that filed a plan is the one that hears
/// the review and the call to align.
fn worked_on(tool: &str, args: &Value) -> Option<String> {
    match tool {
        "list_plans" | "get_standards" => None,
        "create_plan" => args.get("title").and_then(Value::as_str).map(slugify),
        _ => args.get("id").and_then(Value::as_str).map(str::to_string),
    }
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
            Event::Align { plan } => blocks.push(format!(
                "The person set {plan} to alignment. Ask your questions in the harness, then call record_alignment."
            )),
        }
    }
    blocks.join("\n\n")
}

/// Appends whatever the app sent to this result, and tells the app the agent
/// has seen it, so a hook does not say it again.
fn deliver(inbox: &Inbox, session: Option<&local::Client>, reply: &mut Value) {
    let Some(text) = reply
        .pointer("/content/0/text")
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        return;
    };
    let waiting = inbox
        .lock()
        .map(|mut queued| std::mem::take(&mut *queued))
        .unwrap_or_default();
    if waiting.is_empty() {
        return;
    }
    reply["content"][0]["text"] = Value::String(format!("{text}\n\n{}", news(&waiting)));
    if let Some(client) = session {
        client.heard(waiting.len());
    }
}

fn call_tool(
    base: &Base,
    author: &str,
    session: Option<&local::Client>,
    name: &str,
    args: &Value,
) -> Result<Value, (i64, String)> {
    let authoring = settings::current_authoring();
    Ok(match name {
        "create_plan" => create_plan(base, author, authoring, args),
        "update_plan" => update_plan(base, author, args),
        "list_plans" => list_plans(base, args),
        "set_status" => set_status(base, author, args),
        "read_plan" => read_plan(base, args),
        "get_comments" => get_comments(base, args),
        "reply_comment" => reply_comment(base, author, args),
        "resolve_comment" => resolve_comment(base, author, args),
        "get_standards" => get_standards(),
        "record_alignment" => work_tools::record_alignment(base, author, args),
        "add_decisions" => work_tools::add_decisions(base, author, args),
        "add_todos" => work_tools::add_todos(base, author, session.map(local::Client::id), args),
        "update_todo" => work_tools::update_todo(base, author, args),
        "set_repos" => work_tools::set_repos(base, author, args),
        "pr_body" => work_tools::pr_body(base, args),
        "record_pr" => work_tools::record_pr(base, author, args),
        other => return Err((-32602, format!("No such tool: {other}"))),
    })
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
            "tools/list" => Ok(json!({
                "tools": tool_list(settings::current_authoring(), settings::current_media())
            })),
            "tools/call" => {
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
                call_tool(base, &author, session.as_ref(), name, &args).map(|mut reply| {
                    if let Some(client) = &session {
                        if reply["isError"] != Value::Bool(true) {
                            if let Some(plan) = worked_on(name, &args) {
                                client.take_plan(&plan);
                            }
                        }
                    }
                    deliver(&inbox, session.as_ref(), &mut reply);
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

#[cfg(test)]
mod tests {
    use super::*;
    use openplan_core::work::{Alignment, Answer, Question};

    fn aligned() -> WorkRecord {
        let mut record = WorkRecord::default();
        work::record_alignment(
            &mut record,
            vec![Question {
                id: "q1".to_string(),
                aspect: "tests".to_string(),
                question: "Which tests?".to_string(),
                context: None,
                options: Vec::new(),
                recommended: None,
                must_answer: false,
                answer: Some(Answer::Agent {}),
                answered_by: Some("user".to_string()),
                round: None,
            }],
        )
        .unwrap();
        record
    }

    fn with_todos(mut record: WorkRecord, texts: &[&str]) -> WorkRecord {
        let todos: Vec<work::NewTodo> = texts.iter().map(|t| work::NewTodo::Line(t.to_string())).collect();
        work::add_todos(&mut record, &todos, "claude-code", None);
        record
    }

    #[test]
    fn in_progress_needs_the_alignment_and_a_todo_and_says_which_is_missing() {
        let from = Status::Alignment;
        let to = Status::InProgress;

        let neither = guard(from, to, &WorkRecord::default()).unwrap_err();
        let unaligned = guard(from, to, &with_todos(WorkRecord::default(), &["a"])).unwrap_err();
        let no_todos = guard(from, to, &aligned()).unwrap_err();

        assert!(neither.contains("no recorded alignment and no todos"), "{neither}");
        assert!(neither.contains("record_alignment") && neither.contains("add_todos"), "{neither}");
        assert!(unaligned.contains("record_alignment") && !unaligned.contains("add_todos"), "{unaligned}");
        assert!(no_todos.contains("add_todos") && !no_todos.contains("record_alignment"), "{no_todos}");
        assert_eq!(guard(from, to, &with_todos(aligned(), &["a"])), Ok(()));
    }

    #[test]
    fn an_alignment_that_was_only_asked_does_not_count() {
        let mut record = with_todos(WorkRecord::default(), &["a"]);
        record.alignment = Some(Alignment {
            asked_at: "x".to_string(),
            recorded_at: None,
            questions: Vec::new(),
        });

        assert!(guard(Status::Alignment, Status::InProgress, &record).is_err());
    }

    #[test]
    fn in_review_waits_for_every_open_todo_and_lists_them() {
        let mut record = with_todos(aligned(), &["Write it", "Test it", "Ship it"]);
        work::update_todo(&mut record, "t1", TodoState::Done, None, "claude-code").unwrap();
        work::update_todo(&mut record, "t2", TodoState::Doing, None, "claude-code").unwrap();

        let refused = guard(Status::InProgress, Status::InReview, &record).unwrap_err();

        assert_eq!(
            refused,
            "2 todos are still open: t2 (Test it), t3 (Ship it). Call update_todo with done for each, or with dropped and a reason."
        );
        work::update_todo(&mut record, "t2", TodoState::Done, None, "claude-code").unwrap();
        work::update_todo(&mut record, "t3", TodoState::Dropped, Some("Later".into()), "claude-code").unwrap();
        assert_eq!(guard(Status::InProgress, Status::InReview, &record), Ok(()));
    }

    #[test]
    fn the_person_keeps_completed_archived_and_reopening_alignment() {
        let done = with_todos(aligned(), &[]);
        for to in [Status::Completed, Status::Archived] {
            let refused = guard(Status::InReview, to, &done).unwrap_err();
            assert!(refused.contains("Only the person"), "{refused}");
        }
        let reopen = guard(Status::InProgress, Status::Alignment, &done).unwrap_err();
        assert!(reopen.contains("reopens it from the app"), "{reopen}");
        assert_eq!(guard(Status::Draft, Status::Alignment, &done), Ok(()));
    }

    #[test]
    fn the_create_plan_description_says_whether_media_is_on() {
        let describe = |media| tool_list("markdown", media)[0]["description"].as_str().unwrap().to_string();

        assert!(describe(true).contains("Media is on"), "{}", describe(true));
        assert!(describe(false).contains("Media is off"), "{}", describe(false));
    }

    #[test]
    fn every_tool_the_standards_name_is_served() {
        let tools = tool_list("markdown", false);
        let names: Vec<&str> = tools
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();

        let texts = [standards::BUILT_IN.to_string(), openplan_core::integrations::conventions()];
        let named = texts
            .iter()
            .flat_map(|text| text.split('`').skip(1).step_by(2))
            .filter(|word| word.contains('_') && word.chars().all(|c| c.is_ascii_lowercase() || c == '_'));
        for tool in named {
            assert!(names.contains(&tool), "the text names {tool}, which is not a tool");
        }
    }

    #[test]
    fn news_tells_the_agent_to_align() {
        let text = news(&[Event::Align {
            plan: "auth-refactor".to_string(),
        }]);

        assert!(text.contains("auth-refactor"), "{text}");
        assert!(text.contains("record_alignment"), "{text}");
    }
}
