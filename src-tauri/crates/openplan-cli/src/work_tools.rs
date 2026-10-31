//! The tools that write a plan's work record: its alignment, decisions,
//! todos, repos and pull requests. Each write holds the record's lock and
//! commits as the agent. `pr_body` only reads.

use crate::mcp::{commit, find_entry, move_plan, text_result};
use openplan_core::base::Base;
use openplan_core::library::PlanEntry;
use openplan_core::plan::{self, Status};
use openplan_core::work::{self, Answer, Decision, Pr, Question, Repo, TodoState, WorkRecord};
use openplan_core::fs;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

/// How these tools are described to agents, in the order they come up.
pub fn tools() -> Vec<Value> {
    let id = json!({ "type": "string", "description": "The plan's id" });
    vec![
        json!({
            "name": "record_alignment",
            "description": "Record the alignment questions you asked in the harness and the person's answers, once the last answer arrives. Every question needs an answer. A draft moves to alignment.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id,
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": { "type": "string", "description": "q1, q2, and on" },
                                "aspect": { "type": "string", "description": "The question bank aspect, such as tests or edge cases" },
                                "question": { "type": "string" },
                                "options": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": { "type": "string" },
                                            "label": { "type": "string" },
                                            "consequence": { "type": "string", "description": "One line" }
                                        },
                                        "required": ["id", "label"]
                                    }
                                },
                                "recommended": { "type": "string", "description": "The id of the option you recommended" },
                                "mustAnswer": { "type": "boolean" },
                                "answer": {
                                    "type": "object",
                                    "description": "{\"kind\":\"option\",\"options\":[ids]}, {\"kind\":\"text\",\"text\":\"...\"}, or {\"kind\":\"agent\"} when the person let you decide"
                                },
                                "answeredBy": { "type": "string", "description": "Who answered. Defaults to user." }
                            },
                            "required": ["id", "aspect", "question", "options", "answer"]
                        }
                    }
                },
                "required": ["id", "questions"]
            }
        }),
        json!({
            "name": "add_decisions",
            "description": "Record the consequential choices, usually from alignment answers. The server numbers them D1, D2, and on.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id,
                    "decisions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "context": { "type": "string" },
                                "options": { "type": "array", "items": { "type": "string" } },
                                "decision": { "type": "string" },
                                "why": { "type": "string" },
                                "revisitWhen": { "type": "string" },
                                "fromQuestion": { "type": "string", "description": "The alignment question it settles, such as q3" }
                            },
                            "required": ["context", "decision", "why"]
                        }
                    }
                },
                "required": ["id", "decisions"]
            }
        }),
        json!({
            "name": "add_todos",
            "description": "Add todos to a plan, one reviewable unit of work each, and get their ids back. Never replaces the list. A comment that asks for new work becomes a todo. On an in-review plan this moves it back to in-progress.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id,
                    "todos": { "type": "array", "items": { "type": "string" }, "description": "Each one an action that names what it touches" }
                },
                "required": ["id", "todos"]
            }
        }),
        json!({
            "name": "update_todo",
            "description": "Move one todo when you start it and when you finish it. A dropped todo needs a reason.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id,
                    "todo_id": { "type": "string", "description": "t1, t2, and on" },
                    "state": { "type": "string", "enum": ["open", "doing", "done", "dropped"] },
                    "reason": { "type": "string", "description": "Why it was dropped" }
                },
                "required": ["id", "todo_id", "state"]
            }
        }),
        json!({
            "name": "set_repos",
            "description": "Say which repos or folders the plan's work happens in. Replaces the list. Leave out remote for a folder that is not a git repo.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": id, "repos": repos_schema() },
                "required": ["id", "repos"]
            }
        }),
        json!({
            "name": "pr_body",
            "description": "The plan as a PR description: summary, what was agreed, decisions and todos. Call it before opening a PR and paste the text into the description.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id,
                    "todos": { "type": "array", "items": { "type": "string" }, "description": "The ids of the todos this PR covers. Defaults to every done todo." }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "record_pr",
            "description": "Record a pull request after you open it, and again with the same url whenever its state, checks or review change. Its state is draft while the PR is a draft.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": id,
                    "pr": {
                        "type": "object",
                        "properties": {
                            "url": { "type": "string" },
                            "repo": { "type": "string" },
                            "branch": { "type": "string" },
                            "todos": { "type": "array", "items": { "type": "string" }, "description": "The ids of the todos it covers" },
                            "state": { "type": "string", "enum": ["open", "draft", "merged", "closed"], "description": "draft while the PR is a draft" },
                            "checks": { "type": "string", "enum": ["pending", "passing", "failing"] },
                            "review": { "type": "string", "enum": ["waiting", "changes-requested", "approved"] }
                        },
                        "required": ["url", "state", "checks", "review"]
                    }
                },
                "required": ["id", "pr"]
            }
        }),
    ]
}

/// The `repos` argument, shared with `create_plan`.
pub fn repos_schema() -> Value {
    json!({
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "Where the work happens on this machine" },
                "remote": { "type": "string", "description": "The git remote, such as github.com/owner/repo" },
                "branch": { "type": "string" }
            },
            "required": ["path"]
        }
    })
}

/// The repos in `args`, or `None` when the caller passed none.
pub fn parse_repos(args: &Value) -> Result<Option<Vec<Repo>>, String> {
    if args.get("repos").is_none() {
        return Ok(None);
    }
    parse_list(args, "repos", &[]).map(Some)
}

pub fn record_alignment(base: &Base, author: &str, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let questions: Vec<Question> = match parse_list(args, "questions", &[("answeredBy", json!("user"))]) {
        Ok(questions) if !questions.is_empty() => questions,
        Ok(_) => return text_result("record_alignment needs the questions you asked.", true),
        Err(e) => return text_result(e, true),
    };
    let recorded = change_record(&entry, |record| {
        work::record_alignment(record, questions).map_err(|ids| {
            format!(
                "{} {} no answer. Ask in the harness, then call record_alignment again with every answer.",
                listed(&ids),
                if ids.len() == 1 { "has" } else { "have" }
            )
        })
    });
    if let Err(e) = recorded {
        return text_result(e, true);
    }
    let mut reply = format!("Recorded the alignment on {}.", entry.meta.id);
    if entry.meta.status == Status::Draft {
        if let Err(e) = move_plan(&entry, Status::Alignment) {
            return text_result(e, true);
        }
        reply.push_str(" It is now in alignment.");
    }
    finish(base, author, "align", &entry, reply)
}

pub fn add_decisions(base: &Base, author: &str, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let stamps = [
        ("id", json!("")),
        ("options", json!([])),
        ("at", json!("")),
        ("by", json!(author)),
    ];
    let decisions: Vec<Decision> = match parse_list(args, "decisions", &stamps) {
        Ok(decisions) if !decisions.is_empty() => decisions,
        Ok(_) => return text_result("add_decisions needs at least one decision.", true),
        Err(e) => return text_result(e, true),
    };
    let mut ids = Vec::new();
    if let Err(e) = change_record(&entry, |record| {
        ids = work::add_decisions(record, decisions).into_iter().map(|d| d.id).collect();
        Ok(())
    }) {
        return text_result(e, true);
    }
    finish(base, author, "decisions", &entry, format!("Recorded {}.", listed(&ids)))
}

pub fn add_todos(base: &Base, author: &str, session: Option<&str>, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let texts: Vec<String> = match parse_list(args, "todos", &[]) {
        Ok(texts) if !texts.is_empty() => texts,
        Ok(_) => return text_result("add_todos needs at least one todo.", true),
        Err(e) => return text_result(e, true),
    };
    let mut ids = Vec::new();
    if let Err(e) = change_record(&entry, |record| {
        ids = work::add_todos(record, &texts, author, session).into_iter().map(|t| t.id).collect();
        Ok(())
    }) {
        return text_result(e, true);
    }
    let mut reply = format!("Added {}.", listed(&ids));
    // New work on a plan waiting for review means it is not done after all.
    if entry.meta.status == Status::InReview {
        if let Err(e) = move_plan(&entry, Status::InProgress) {
            return text_result(e, true);
        }
        reply.push_str(&format!(" {} was in review, so it is back in progress.", entry.meta.id));
    }
    finish(base, author, "todos", &entry, reply)
}

pub fn update_todo(base: &Base, author: &str, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let Some(todo_id) = args.get("todo_id").and_then(Value::as_str) else {
        return text_result("update_todo needs a todo_id, such as t1.", true);
    };
    let state: TodoState = match args.get("state").cloned().map(serde_json::from_value) {
        Some(Ok(state)) => state,
        _ => return text_result("state must be open, doing, done, or dropped.", true),
    };
    let reason = args.get("reason").and_then(Value::as_str).map(str::to_string);
    if let Err(e) = change_record(&entry, |record| {
        work::update_todo(record, todo_id, state, reason, author).map(|_| ())
    }) {
        return text_result(e, true);
    }
    let state = serde_json::to_value(state).ok();
    let state = state.as_ref().and_then(Value::as_str).unwrap_or_default();
    finish(base, author, "todos", &entry, format!("{todo_id} is {state}."))
}

pub fn set_repos(base: &Base, author: &str, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let repos = match parse_repos(args) {
        Ok(Some(repos)) => repos,
        Ok(None) => return text_result("set_repos needs the repos list. Pass an empty list to clear it.", true),
        Err(e) => return text_result(e, true),
    };
    let count = repos.len();
    if let Err(e) = change_record(&entry, |record| {
        work::set_repos(record, repos);
        Ok(())
    }) {
        return text_result(e, true);
    }
    let reply = format!("Recorded {count} repo{}.", if count == 1 { "" } else { "s" });
    finish(base, author, "repos", &entry, reply)
}

pub fn record_pr(base: &Base, author: &str, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let stamps = [("reportedAt", json!("")), ("by", json!(author))];
    let pr: Pr = match args.get("pr").map(|pr| parse_item(pr, &stamps)) {
        Some(Ok(pr)) => pr,
        Some(Err(e)) => return text_result(format!("pr isn't in the shape the tool describes: {e}"), true),
        None => return text_result("record_pr needs the pr: its url, state, checks and review.", true),
    };
    let url = pr.url.clone();
    if let Err(e) = change_record(&entry, |record| {
        work::record_pr(record, pr);
        Ok(())
    }) {
        return text_result(e, true);
    }
    finish(base, author, "pr", &entry, format!("Recorded {url}."))
}

pub fn pr_body(base: &Base, args: &Value) -> Value {
    let entry = match find_entry(base, args) {
        Ok(entry) => entry,
        Err(reply) => return reply,
    };
    let text = match fs::read_to_string(&entry.path) {
        Ok(text) => text,
        Err(e) => return text_result(e, true),
    };
    let record = match work::read(&entry.path) {
        Ok(record) => record.unwrap_or_default(),
        Err(e) => return text_result(e, true),
    };
    let covered: Option<Vec<String>> = args
        .get("todos")
        .and_then(Value::as_array)
        .map(|ids| ids.iter().filter_map(Value::as_str).map(str::to_string).collect());
    let parsed = plan::parse(&text, &entry.path);
    let summary = if parsed.html { String::new() } else { summary(&parsed.body) };
    text_result(
        render_pr_body(&entry.meta.id, &entry.meta.title, &summary, &record, covered.as_deref()),
        false,
    )
}

/// The reviewer's version of the plan, for a PR description.
pub fn render_pr_body(
    id: &str,
    title: &str,
    summary: &str,
    record: &WorkRecord,
    covered: Option<&[String]>,
) -> String {
    let mut out = format!("# {title}\n\n");
    if !summary.is_empty() {
        out.push_str(&format!("{summary}\n\n"));
    }
    if let Some(alignment) = record.alignment.as_ref().filter(|a| !a.questions.is_empty()) {
        out.push_str("## What was agreed\n\n");
        for question in &alignment.questions {
            out.push_str(&format!("- {} {}\n", question.question, answer_line(question)));
        }
        out.push('\n');
    }
    if !record.decisions.is_empty() {
        out.push_str("## Decisions\n\n");
        for decision in &record.decisions {
            out.push_str(&format!("- {}: {}\n", decision.id, decision.decision));
        }
        out.push('\n');
    }
    let todos: Vec<_> = record
        .todos
        .iter()
        .filter(|t| match covered {
            Some(ids) => ids.contains(&t.id),
            None => t.state == TodoState::Done,
        })
        .collect();
    if !todos.is_empty() {
        out.push_str("## Todos in this PR\n\n");
        for todo in todos {
            let mark = if todo.state == TodoState::Done { "x" } else { " " };
            out.push_str(&format!("- [{mark}] {} {}\n", todo.id, todo.text));
        }
        out.push('\n');
    }
    out.push_str(&format!("Plan: {id} in OpenPlan\n"));
    out
}

/// The Summary section, or failing that the lead between the title and the
/// first section. Headings inside code fences are code, not sections.
pub fn summary(body: &str) -> String {
    let mut lead: Vec<&str> = Vec::new();
    let mut section: Option<Vec<&str>> = None;
    let mut in_summary = false;
    let mut seen_section = false;
    let mut fenced = false;
    for line in body.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fenced = !fenced;
        }
        let level = if fenced { 0 } else { trimmed.chars().take_while(|c| *c == '#').count() };
        let heading = level > 0 && trimmed[level..].starts_with(' ');
        if heading && level == 1 && !seen_section && lead.iter().all(|l| l.trim().is_empty()) {
            continue; // the title
        }
        if heading {
            seen_section = true;
            in_summary = trimmed[level..].trim().eq_ignore_ascii_case("summary");
            if in_summary {
                section = Some(Vec::new());
            } else if section.is_some() {
                break;
            }
            continue;
        }
        match (&mut section, in_summary, seen_section) {
            (Some(lines), true, _) => lines.push(line),
            (_, _, false) => lead.push(line),
            _ => {}
        }
    }
    section.unwrap_or(lead).join("\n").trim().to_string()
}

fn answer_line(question: &Question) -> String {
    let label = |id: &str| {
        question
            .options
            .iter()
            .find(|o| o.id == id)
            .map_or(id.to_string(), |o| o.label.clone())
    };
    match &question.answer {
        Some(Answer::Chosen { options }) => {
            options.iter().map(|id| label(id)).collect::<Vec<_>>().join(", ")
        }
        Some(Answer::Text { text }) => text.clone(),
        Some(Answer::Agent {}) => match &question.recommended {
            Some(id) => format!("{} (agent decided)", label(id)),
            None => "Agent decided.".to_string(),
        },
        None => "No answer.".to_string(),
    }
}

/// Changes the record under its lock. A plan from before 0.3.0 carries its
/// PR in frontmatter, and the first write copies it in.
fn change_record(
    entry: &PlanEntry,
    change: impl FnOnce(&mut WorkRecord) -> Result<(), String>,
) -> Result<WorkRecord, String> {
    let legacy = entry.meta.pr.clone();
    work::modify(&entry.path, |record| {
        if let Some(url) = &legacy {
            work::absorb_pr(record, url);
        }
        change(record)
    })
}

/// Commits the write, and answers with `reply` unless the commit failed.
fn finish(base: &Base, author: &str, verb: &str, entry: &PlanEntry, reply: String) -> Value {
    match commit(base, author, &format!("agent({author}): {verb} {}", entry.meta.id)) {
        Ok(()) => text_result(reply, false),
        Err(e) => text_result(e, true),
    }
}

/// A list argument, with the fields the server fills in itself added to each
/// item so the agent never has to send them.
fn parse_list<T: DeserializeOwned>(
    args: &Value,
    key: &str,
    stamps: &[(&str, Value)],
) -> Result<Vec<T>, String> {
    let Some(items) = args.get(key).and_then(Value::as_array) else {
        return Err(format!("{key} must be a list."));
    };
    items
        .iter()
        .map(|item| parse_item(item, stamps))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("{key} isn't in the shape the tool describes: {e}"))
}

fn parse_item<T: DeserializeOwned>(item: &Value, stamps: &[(&str, Value)]) -> Result<T, serde_json::Error> {
    let mut item = item.clone();
    if let Some(fields) = item.as_object_mut() {
        for (field, value) in stamps {
            fields.entry(*field).or_insert_with(|| value.clone());
        }
    }
    serde_json::from_value(item)
}

/// "t1", "t1 and t2", "t1, t2 and t3".
fn listed(ids: &[String]) -> String {
    match ids {
        [] => String::new(),
        [one] => one.clone(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use openplan_core::work::{Alignment, Choice, Todo};

    fn choice(id: &str, label: &str) -> Choice {
        Choice {
            id: id.to_string(),
            label: label.to_string(),
            consequence: None,
        }
    }

    fn question(id: &str, text: &str, answer: Answer) -> Question {
        Question {
            id: id.to_string(),
            aspect: "tests".to_string(),
            question: text.to_string(),
            options: vec![choice("a", "Unit tests"), choice("b", "Unit and end-to-end tests")],
            recommended: Some("a".to_string()),
            must_answer: false,
            answer: Some(answer),
            answered_by: Some("user".to_string()),
        }
    }

    fn todo(id: &str, text: &str, state: TodoState) -> Todo {
        Todo {
            id: id.to_string(),
            text: text.to_string(),
            state,
            by: "claude-code".to_string(),
            session: None,
            at: "2026-10-28T10:00:00Z".to_string(),
            reason: None,
        }
    }

    fn record() -> WorkRecord {
        WorkRecord {
            alignment: Some(Alignment {
                asked_at: "2026-10-28T09:00:00Z".to_string(),
                recorded_at: Some("2026-10-28T09:10:00Z".to_string()),
                questions: vec![
                    question("q1", "What has to be tested?", Answer::Chosen { options: vec!["b".to_string()] }),
                    question("q2", "Where does the logic live?", Answer::Agent {}),
                    question("q3", "What happens to old records?", Answer::Text { text: "Leave them.".to_string() }),
                ],
            }),
            decisions: vec![Decision {
                id: "D1".to_string(),
                context: "Where the guard lives".to_string(),
                options: vec!["server".to_string(), "app".to_string()],
                decision: "The server guards every status move.".to_string(),
                why: "Agents call it directly.".to_string(),
                revisit_when: None,
                from_question: Some("q2".to_string()),
                at: "2026-10-28T09:11:00Z".to_string(),
                by: "claude-code".to_string(),
            }],
            todos: vec![
                todo("t1", "Add the guard to `set_status`", TodoState::Done),
                todo("t2", "Write the guard tests", TodoState::Done),
                todo("t3", "Update the docs", TodoState::Open),
            ],
            ..WorkRecord::default()
        }
    }

    const BODY: &str = "# Guarded status\n\n**Status:** draft\n\n## Summary\n\nThe server refuses moves the work has not earned.\n\n```sh\n# not a heading\n```\n\n## Steps\n\nOne.\n";

    #[test]
    fn the_pr_body_matches_the_golden_file() {
        let body = render_pr_body("guarded-status", "Guarded status", &summary(BODY), &record(), None);

        assert_eq!(body, include_str!("../tests/fixtures/pr_body.md"));
    }

    #[test]
    fn the_pr_body_lists_the_todos_the_caller_names() {
        let covered = ["t3".to_string()];

        let body = render_pr_body("p", "P", "", &record(), Some(&covered));

        assert!(body.contains("- [ ] t3 Update the docs\n"), "{body}");
        assert!(!body.contains("t1"), "{body}");
    }

    #[test]
    fn a_plan_with_no_record_still_gets_a_title_and_a_link() {
        let body = render_pr_body("p", "P", "", &WorkRecord::default(), None);

        assert_eq!(body, "# P\n\nPlan: p in OpenPlan\n");
    }

    #[test]
    fn without_a_summary_section_the_lead_is_the_summary() {
        let body = "# Title\n\nThe lead paragraph.\n\n## Approach\n\nNot this.\n";

        assert_eq!(summary(body), "The lead paragraph.");
        assert_eq!(summary("No headings at all.\n"), "No headings at all.");
    }

    #[test]
    fn a_summary_section_stops_at_the_next_section() {
        assert_eq!(summary(BODY), "The server refuses moves the work has not earned.\n\n```sh\n# not a heading\n```");
    }

    fn schema_of(tool: &str) -> Value {
        tools()
            .into_iter()
            .find(|t| t["name"] == tool)
            .unwrap_or_else(|| panic!("no {tool}"))["inputSchema"]
            .clone()
    }

    #[test]
    fn record_pr_takes_a_draft_state() {
        let tool = tools().into_iter().find(|t| t["name"] == "record_pr").unwrap();
        let states = &schema_of("record_pr")["properties"]["pr"]["properties"]["state"]["enum"];

        assert_eq!(states, &json!(["open", "draft", "merged", "closed"]));
        assert!(tool["description"].as_str().unwrap().contains("draft while the PR is a draft"));
    }

    #[test]
    fn ids_are_listed_the_way_a_sentence_reads() {
        let ids = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();

        assert_eq!(listed(&ids(&["t1"])), "t1");
        assert_eq!(listed(&ids(&["t1", "t2"])), "t1 and t2");
        assert_eq!(listed(&ids(&["t1", "t2", "t3"])), "t1, t2 and t3");
    }
}
