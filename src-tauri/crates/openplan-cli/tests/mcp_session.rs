//! A whole MCP session against the real binary, the way an agent runs it:
//! spawned, spoken to over stdio, and judged by what lands in the base.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

/// What `ask_questions` tells agents, in its description and in its reply.
const AIM_FOR_FULL_ALIGNMENT: &str = "Aim for an alignment score of 100";

#[test]
fn an_agent_can_file_a_plan_and_read_it_back() {
    let home = std::env::temp_dir().join(format!("openplan-mcp-session-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&home);
    std::fs::create_dir_all(&home).unwrap();

    let mut server = Command::new(env!("CARGO_BIN_EXE_openplan"))
        .arg("mcp")
        .env("HOME", &home)
        .env_remove("XDG_CONFIG_HOME")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("the server should start");
    let mut stdin = server.stdin.take().unwrap();
    let mut lines = BufReader::new(server.stdout.take().unwrap()).lines();
    // Notifications get no reply, so `ask` only reads when an id was sent.
    let mut ask = |message: &str| -> serde_json::Value {
        writeln!(stdin, "{message}").unwrap();
        if !message.contains("\"id\"") {
            return serde_json::Value::Null;
        }
        let line = lines.next().expect("a reply").unwrap();
        serde_json::from_str(&line).expect("json-rpc")
    };

    // The handshake carries who is calling; plans get attributed to them.
    let init = ask(
        r##"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"1.0"}}}"##,
    );
    assert_eq!(init["result"]["serverInfo"]["name"], "openplan");
    ask(r##"{"jsonrpc":"2.0","method":"notifications/initialized"}"##);


    let tools = ask(r##"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"##);
    let names: Vec<&str> = tools["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        vec![
            "create_plan", "update_plan", "list_plans", "set_status", "read_plan",
            "get_comments", "reply_comment", "resolve_comment", "get_standards",
            "ask_questions", "record_alignment", "add_decisions", "add_todos", "update_todo",
            "set_repos", "pr_body", "record_pr"
        ]
    );
    let described = tools["result"]["tools"].to_string();
    for status in ["draft", "alignment", "in-progress", "in-review", "completed", "archived"] {
        assert!(described.contains(status), "the tools name every status: {status}");
    }
    assert!(described.contains(AIM_FOR_FULL_ALIGNMENT), "ask_questions tells agents to aim for 100");

    let standards = ask(r##"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_standards","arguments":{}}}"##);
    assert!(standards["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Plan standards"));

    let created = ask(
        r##"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Auth refactor","body":"# Auth refactor\n\n## Summary\n\nwhy\n\n## Current state\n\nnow\n\n## Approach\n\nthis\n\n## Steps\n\none\n\n## Risks and open questions\n\nnone","type":"feature"}}}"##,
    );
    assert_eq!(created["result"]["isError"], false, "{created}");
    let filed = created["result"]["content"][0]["text"].as_str().unwrap();
    assert_eq!(filed, "Filed as auth-refactor.", "every required section is there");

    // Filing the same title again is refused, not overwritten.
    let dup = ask(
        r##"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Auth refactor","body":"other"}}}"##,
    );
    assert_eq!(dup["result"]["isError"], true);

    // A plan short of the sections its type calls for is filed anyway, and said so.
    let thin = ask(
        r##"{"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Token refresh loops","body":"# Token refresh loops\n\n## Summary\n\nit loops","type":"bug"}}}"##,
    );
    assert_eq!(thin["result"]["isError"], false, "{thin}");
    let warned = thin["result"]["content"][0]["text"].as_str().unwrap();
    assert!(warned.contains("Reproduction"), "{warned}");
    assert!(warned.contains("Blast radius"), "{warned}");

    let listed = ask(r##"{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}"##);
    let listing = listed["result"]["content"][0]["text"].as_str().unwrap();
    assert!(listing.contains("[draft] auth-refactor Auth refactor"), "{listing}");
    assert!(!listing.contains('('), "a plan names no project: {listing}");

    // A session may open alignment on a draft.
    let aligning = ask(r##"{"jsonrpc":"2.0","id":16,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"alignment"}}}"##);
    assert_eq!(aligning["result"]["isError"], false, "{aligning}");

    // Work cannot start before the questions are answered and the work is listed.
    let early = ask(r##"{"jsonrpc":"2.0","id":30,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-progress"}}}"##);
    assert_eq!(early["result"]["isError"], true, "{early}");
    let refusal = early["result"]["content"][0]["text"].as_str().unwrap();
    assert!(refusal.contains("record_alignment") && refusal.contains("add_todos"), "{refusal}");

    // An unanswered question is named back rather than recorded.
    let half = ask(&r##"{"jsonrpc":"2.0","id":31,"method":"tools/call","params":{"name":"record_alignment","arguments":{"id":"auth-refactor","questions":[
        {"id":"q1","aspect":"tests","question":"What has to be tested?","options":[{"id":"a","label":"Unit tests"}],"recommended":"a","answer":{"kind":"option","options":["a"]}},
        {"id":"q2","aspect":"scale","question":"How large a case?","options":[{"id":"a","label":"Today's largest"}]}
    ]}}}"##.replace('\n', ""));
    assert_eq!(half["result"]["isError"], true, "{half}");
    assert!(half["result"]["content"][0]["text"].as_str().unwrap().contains("q2"), "{half}");

    let aligned = ask(&r##"{"jsonrpc":"2.0","id":32,"method":"tools/call","params":{"name":"record_alignment","arguments":{"id":"auth-refactor","questions":[
        {"id":"q1","aspect":"tests","question":"What has to be tested?","options":[{"id":"a","label":"Unit tests"}],"recommended":"a","answer":{"kind":"option","options":["a"]}},
        {"id":"q2","aspect":"scale","question":"How large a case?","options":[{"id":"a","label":"Today's largest"}],"recommended":"a","answer":{"kind":"agent"}}
    ]}}}"##.replace('\n', ""));
    assert_eq!(aligned["result"]["isError"], false, "{aligned}");
    // A later round is recorded on its own, and the first one stays.
    let second = ask(&r##"{"jsonrpc":"2.0","id":45,"method":"tools/call","params":{"name":"record_alignment","arguments":{"id":"auth-refactor","questions":[
        {"id":"q3","aspect":"edge cases","question":"What if the refresh fails?","options":[{"id":"a","label":"Sign out"}],"recommended":"a","answer":{"kind":"option","options":["a"]}}
    ]}}}"##.replace('\n', ""));
    assert_eq!(second["result"]["isError"], false, "{second}");

    let decided = ask(r##"{"jsonrpc":"2.0","id":33,"method":"tools/call","params":{"name":"add_decisions","arguments":{"id":"auth-refactor","decisions":[{"context":"Where tokens live","options":["cookie","header"],"decision":"Tokens travel in a header.","why":"The API has no cookies.","fromQuestion":"q1"}]}}}"##);
    assert_eq!(decided["result"]["content"][0]["text"], "Recorded D1.", "{decided}");

    let todos = ask(r##"{"jsonrpc":"2.0","id":34,"method":"tools/call","params":{"name":"add_todos","arguments":{"id":"auth-refactor","todos":["Move tokens to a header",{"title":"Test the refresh path","detail":"Cover an expired token and a revoked one."}]}}}"##);
    assert_eq!(todos["result"]["content"][0]["text"], "Added t1 and t2.", "{todos}");

    let repos = ask(r##"{"jsonrpc":"2.0","id":35,"method":"tools/call","params":{"name":"set_repos","arguments":{"id":"auth-refactor","repos":[{"path":"~/work/api","remote":"github.com/acme/api","branch":"feat/header-tokens"}]}}}"##);
    assert_eq!(repos["result"]["isError"], false, "{repos}");

    let started = ask(r##"{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-progress"}}}"##);
    assert_eq!(started["result"]["isError"], false, "{started}");
    // Once the work has started, going back to alignment is the person's call.
    let back = ask(r##"{"jsonrpc":"2.0","id":18,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"alignment"}}}"##);
    assert_eq!(back["result"]["isError"], true, "{back}");

    // A question after the work starts is posted for the person, and the plan stays in progress.
    let posted = ask(&r##"{"jsonrpc":"2.0","id":46,"method":"tools/call","params":{"name":"ask_questions","arguments":{"id":"auth-refactor","questions":[
        {"id":"q4","aspect":"edge cases","role":"oncall","question":"Who is told when refresh keeps failing?","illustration":"```mermaid\nflowchart LR\n  fail --> alert\n```","options":[{"id":"a","label":"Page on-call","illustration":"An alert after 5 failures in a minute."}],"recommended":"a"}
    ]}}}"##.replace('\n', ""));
    assert_eq!(posted["result"]["isError"], false, "{posted}");
    let posted_reply = posted["result"]["content"][0]["text"].as_str().unwrap();
    assert!(posted_reply.contains("q4"), "{posted}");
    assert!(posted_reply.contains(AIM_FOR_FULL_ALIGNMENT), "{posted}");
    assert!(
        posted_reply.ends_with("This plan still needs an understanding statement for entities, states, edge cases, error handling and scale."),
        "a call from an agent that sends no statements is accepted, and told what is missing: {posted}"
    );
    let answered_again = ask(&r##"{"jsonrpc":"2.0","id":47,"method":"tools/call","params":{"name":"ask_questions","arguments":{"id":"auth-refactor","questions":[
        {"id":"q1","aspect":"tests","question":"What has to be tested?","options":[{"id":"a","label":"Unit tests"}]}
    ]}}}"##.replace('\n', ""));
    assert_eq!(answered_again["result"]["isError"], true, "{answered_again}");

    // The agent cannot finish or put away a plan on the person's behalf.
    for status in ["completed", "archived"] {
        let refused = ask(&format!(
            r##"{{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{{"name":"set_status","arguments":{{"id":"auth-refactor","status":"{status}"}}}}}}"##
        ));
        assert_eq!(refused["result"]["isError"], true, "{status}: {refused}");
    }
    // Review waits until no todo is open.
    let unfinished = ask(r##"{"jsonrpc":"2.0","id":36,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-review"}}}"##);
    assert_eq!(unfinished["result"]["isError"], true, "{unfinished}");
    assert!(unfinished["result"]["content"][0]["text"].as_str().unwrap().contains("t1 (Move tokens to a header)"));
    for todo in ["t1", "t2"] {
        let done = ask(&format!(
            r##"{{"jsonrpc":"2.0","id":37,"method":"tools/call","params":{{"name":"update_todo","arguments":{{"id":"auth-refactor","todo_id":"{todo}","state":"done"}}}}}}"##
        ));
        assert_eq!(done["result"]["content"][0]["text"], format!("{todo} is done."), "{done}");
    }
    let moved = ask(r##"{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-review"}}}"##);
    assert_eq!(moved["result"]["isError"], false, "{moved}");
    let late = ask(r##"{"jsonrpc":"2.0","id":48,"method":"tools/call","params":{"name":"ask_questions","arguments":{"id":"auth-refactor","questions":[{"id":"q5","aspect":"scope","question":"More?","options":[{"id":"a","label":"No"}]}]}}}"##);
    assert_eq!(late["result"]["isError"], true, "a plan in review takes no new questions: {late}");

    // New work in review sends the plan back to in progress, and says so.
    let more = ask(r##"{"jsonrpc":"2.0","id":38,"method":"tools/call","params":{"name":"add_todos","arguments":{"id":"auth-refactor","todos":["Log refresh failures"]}}}"##);
    let more_text = more["result"]["content"][0]["text"].as_str().unwrap();
    assert!(more_text.contains("Added t3.") && more_text.contains("back in progress"), "{more_text}");
    let dropped = ask(r##"{"jsonrpc":"2.0","id":39,"method":"tools/call","params":{"name":"update_todo","arguments":{"id":"auth-refactor","todo_id":"t3","state":"dropped","reason":"Logging already covers it."}}}"##);
    assert_eq!(dropped["result"]["isError"], false, "{dropped}");
    let back = ask(r##"{"jsonrpc":"2.0","id":40,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-review"}}}"##);
    assert_eq!(back["result"]["isError"], false, "{back}");

    let body = ask(r##"{"jsonrpc":"2.0","id":41,"method":"tools/call","params":{"name":"pr_body","arguments":{"id":"auth-refactor"}}}"##);
    let body_text = body["result"]["content"][0]["text"].as_str().unwrap();
    assert!(body_text.starts_with("# Auth refactor\n\nwhy\n"), "{body_text}");
    assert!(body_text.contains("- How large a case? Today's largest (agent decided)"), "{body_text}");
    assert!(body_text.contains("- D1: Tokens travel in a header."), "{body_text}");
    assert!(body_text.contains("- [x] t1 Move tokens to a header"), "{body_text}");
    assert!(body_text.ends_with("Plan: auth-refactor in OpenPlan\n"), "{body_text}");

    let pr = ask(r##"{"jsonrpc":"2.0","id":42,"method":"tools/call","params":{"name":"record_pr","arguments":{"id":"auth-refactor","pr":{"url":"https://github.com/acme/api/pull/7","repo":"github.com/acme/api","todos":["t1","t2"],"state":"open","checks":"pending","review":"waiting"}}}}"##);
    assert_eq!(pr["result"]["isError"], false, "{pr}");
    let merged = ask(r##"{"jsonrpc":"2.0","id":43,"method":"tools/call","params":{"name":"record_pr","arguments":{"id":"auth-refactor","pr":{"url":"https://github.com/acme/api/pull/7","state":"merged","checks":"passing","review":"approved"}}}}"##);
    assert_eq!(merged["result"]["isError"], false, "{merged}");

    let progress = ask(r##"{"jsonrpc":"2.0","id":44,"method":"tools/call","params":{"name":"list_plans","arguments":{"status":"in-review"}}}"##);
    assert_eq!(
        progress["result"]["content"][0]["text"],
        "[in-review] auth-refactor Auth refactor · todos 2/2",
        "{progress}"
    );

    let read = ask(r##"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"read_plan","arguments":{"id":"auth-refactor"}}}"##);
    let text = read["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("source: claude-code"), "client name normalised: {text}");
    assert!(text.contains("type: feature"), "{text}");
    assert!(text.contains("status: in-review"), "{text}");
    assert!(!text.contains("project:"), "{text}");
    assert!(!text.contains("pr:"), "{text}");

    // The user starts a review the way the app writes one: on disk at once,
    // and pending until they send it.
    // Whichever build this is, the server puts its base where that
    // build looks for it.
    let base_root = home.join(openplan_core::profile::base_dir_name());
    let plan_path = base_root.join("plans/auth-refactor.md");
    let record = openplan_core::work::read(&plan_path).unwrap().unwrap();
    let asked: Vec<_> = record.alignment.as_ref().unwrap().questions.iter().map(|q| (q.id.as_str(), q.round)).collect();
    assert_eq!(asked, [("q1", Some(1)), ("q2", Some(1)), ("q3", Some(2)), ("q4", Some(3))]);
    let posted = &record.alignment.as_ref().unwrap().questions[3];
    assert_eq!((posted.answer.as_ref(), posted.role.as_ref()), (None, Some(&openplan_core::work::Role::Oncall)));
    assert!(posted.illustration.as_deref().unwrap().contains("mermaid"));
    assert!(posted.options[0].illustration.is_some());
    assert_eq!(record.todos[0].detail, None, "a plain line is still a todo");
    assert_eq!(record.todos[1].text, "Test the refresh path");
    assert_eq!(record.todos[1].detail.as_deref(), Some("Cover an expired token and a revoked one."));
    let mut written = openplan_core::comments::CommentThread {
        id: "t1".to_string(),
        quote: "why".to_string(),
        line_start: 10,
        line_end: 10,
        resolved: false,
        pending: true,
        resolved_by: None,
        resolved_at: None,
        sent_at: None,
        comments: vec![openplan_core::comments::CommentEntry {
            id: "c1".to_string(),
            text: "explain this choice".to_string(),
            created_at: "2026-08-16T12:00:00Z".to_string(),
            edited_at: None,
            author: "user".to_string(),
            author_name: Some("Sid".to_string()),
            author_email: Some("sid@hypotenuse.ai".to_string()),
        }],
    };
    openplan_core::comments::write_threads(&plan_path, std::slice::from_ref(&written)).unwrap();

    // Half-written feedback is nobody else's business yet.
    let unsent = ask(r##"{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"get_comments","arguments":{"id":"auth-refactor"}}}"##);
    let unsent_text = unsent["result"]["content"][0]["text"].as_str().unwrap();
    assert!(
        unsent_text.contains("No open review comments"),
        "{unsent_text}"
    );

    // Send is what clears pending and stamps the time it went out.
    written.pending = false;
    written.sent_at = Some("2026-08-16T12:05:00Z".to_string());
    openplan_core::comments::write_threads(&plan_path, std::slice::from_ref(&written)).unwrap();

    // ...and now the agent reads it, replies, and resolves it.
    let review = ask(r##"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_comments","arguments":{"id":"auth-refactor"}}}"##);
    let review_text = review["result"]["content"][0]["text"].as_str().unwrap();
    assert!(review_text.contains("(thread t1) [open]"), "{review_text}");
    assert!(review_text.contains("explain this choice"));
    // The agent is told who is asking, by name rather than by role.
    assert!(review_text.contains("**Comment (Sid):**"), "{review_text}");

    let replied = ask(r##"{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"reply_comment","arguments":{"id":"auth-refactor","thread_id":"t1","text":"Because the schema owns the wire shape."}}}"##);
    assert_eq!(replied["result"]["isError"], false, "{replied}");

    // Its own reply is what makes the thread answered: it now waits on Sid.
    let answered = ask(r##"{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"get_comments","arguments":{"id":"auth-refactor"}}}"##);
    let answered_text = answered["result"]["content"][0]["text"].as_str().unwrap();
    assert!(
        answered_text.contains("(thread t1) [answered]"),
        "{answered_text}"
    );

    let resolved = ask(r##"{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"resolve_comment","arguments":{"id":"auth-refactor","thread_id":"t1"}}}"##);
    assert_eq!(resolved["result"]["isError"], false, "{resolved}");

    let threads = openplan_core::comments::read_threads(&plan_path);
    assert!(threads[0].resolved);
    assert_eq!(threads[0].resolved_by.as_deref(), Some("claude-code"));
    assert!(threads[0].resolved_at.is_some(), "closed at a known time");
    assert_eq!(threads[0].sent_at.as_deref(), Some("2026-08-16T12:05:00Z"));
    assert_eq!(threads[0].comments[1].author, "claude-code");
    // The tool signs its own name, against the person whose base it ran on.
    assert!(threads[0].comments[1].author_name.is_none());
    assert!(threads[0].comments[1].author_email.is_some());

    drop(stdin);
    server.wait().unwrap();

    // What reached disk is a plan the app would list, attributed in history.
    let base = openplan_core::base::Base { root: base_root.clone() };
    let entries = openplan_core::library::scan(&base);
    assert_eq!(entries.len(), 2);
    let history =
        openplan_core::repo::history(&base.root, std::path::Path::new("plans/auth-refactor.md"))
            .unwrap();
    assert_eq!(history[0].author, "claude-code");
    let record = openplan_core::work::read(&plan_path).unwrap().unwrap();
    assert_eq!(record.prs.len(), 1, "one PR, reported twice");
    assert_eq!(record.prs[0].state, openplan_core::work::PrState::Merged);
    assert_eq!(record.repos[0].branch.as_deref(), Some("feat/header-tokens"));
    assert_eq!(record.todos[2].reason.as_deref(), Some("Logging already covers it."));
    assert_eq!(record.decisions[0].by, "claude-code");
    // The work record is in the history too, under the agent's name.
    let work_history = openplan_core::repo::history(
        &base.root,
        std::path::Path::new("plans/.auth-refactor.md.oplan-work.json"),
    )
    .unwrap();
    let messages: Vec<&str> = work_history.iter().map(|r| r.message.as_str()).collect();
    for verb in ["align", "decisions", "todos", "repos", "pr"] {
        let wanted = format!("agent(claude-code): {verb} auth-refactor");
        assert!(messages.contains(&wanted.as_str()), "no {wanted} in {messages:?}");
    }

    let _ = std::fs::remove_dir_all(&home);
}

/// A plan written before 0.3.0: revised in place, with what this build does
/// not write kept, and its PR moved into the work record.
#[test]
fn update_plan_keeps_the_frontmatter_and_refuses_a_finished_plan() {
    let home = std::env::temp_dir().join(format!("openplan-mcp-session-update-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&home);
    let plans = home.join(openplan_core::profile::base_dir_name()).join("plans");
    std::fs::create_dir_all(&plans).unwrap();
    std::fs::write(
        plans.join("old-plan.md"),
        "---\nid: old-plan\ntitle: Old plan\nstatus: in-review\ntype: bug\nsource: codex\nreviewer: Sid\npr: https://github.com/acme/api/pull/3\nupdated: 2026-01-01T00:00:00Z\n---\n# Old plan\n\nfirst draft\n",
    )
    .unwrap();
    std::fs::write(
        plans.join("shipped.md"),
        "---\nid: shipped\ntitle: Shipped\nstatus: completed\n---\n# Shipped\n",
    )
    .unwrap();

    let mut server = Command::new(env!("CARGO_BIN_EXE_openplan"))
        .arg("mcp")
        .env("HOME", &home)
        .env_remove("XDG_CONFIG_HOME")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("the server should start");
    let mut stdin = server.stdin.take().unwrap();
    let mut lines = BufReader::new(server.stdout.take().unwrap()).lines();
    let mut ask = |message: &str| -> serde_json::Value {
        writeln!(stdin, "{message}").unwrap();
        let line = lines.next().expect("a reply").unwrap();
        serde_json::from_str(&line).expect("json-rpc")
    };
    ask(r##"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"1.0"}}}"##);

    let updated = ask(r##"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"update_plan","arguments":{"id":"old-plan","body":"# Old plan\n\n## Summary\n\nsecond draft"}}}"##);
    assert_eq!(updated["result"]["isError"], false, "{updated}");
    let reply = updated["result"]["content"][0]["text"].as_str().unwrap();
    assert!(reply.starts_with("Updated old-plan."), "{reply}");
    assert!(reply.contains("Reproduction"), "a bug plan is told what it lacks: {reply}");

    let finished = ask(r##"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"update_plan","arguments":{"id":"shipped","body":"# Shipped\n\nchanged"}}}"##);
    assert_eq!(finished["result"]["isError"], true, "{finished}");

    drop(stdin);
    server.wait().unwrap();

    let text = std::fs::read_to_string(plans.join("old-plan.md")).unwrap();
    assert!(text.contains("\nreviewer: Sid\n"), "{text}");
    assert!(text.contains("\npr: https://github.com/acme/api/pull/3\n"), "{text}");
    assert!(text.contains("\nstatus: in-review\n"), "{text}");
    assert!(!text.contains("2026-01-01T00:00:00Z"), "updated is bumped: {text}");
    assert!(text.ends_with("---\n# Old plan\n\n## Summary\n\nsecond draft\n"), "{text}");
    let record = openplan_core::work::read(&plans.join("old-plan.md")).unwrap().unwrap();
    assert_eq!(record.prs[0].url, "https://github.com/acme/api/pull/3");
    assert_eq!(
        std::fs::read_to_string(plans.join("shipped.md")).unwrap(),
        "---\nid: shipped\ntitle: Shipped\nstatus: completed\n---\n# Shipped\n"
    );

    let _ = std::fs::remove_dir_all(&home);
}

/// Where `dirs` puts a config directory for a given home, which is how the
/// server finds the settings this test writes for it.
#[cfg(unix)]
fn config_dir(home: &std::path::Path) -> std::path::PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support")
    } else {
        home.join(".config")
    }
}

#[cfg(unix)]
#[test]
fn in_html_mode_the_plan_on_disk_is_an_html_document() {
    let home = std::env::temp_dir().join(format!("openplan-mcp-session-html-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&home);
    let settings = config_dir(&home).join(openplan_core::profile::name());
    std::fs::create_dir_all(&settings).unwrap();
    let base_path = home.join(openplan_core::profile::base_dir_name());
    // Filed before the mode changed, and still the plan that owns that id.
    std::fs::create_dir_all(base_path.join("plans")).unwrap();
    std::fs::write(base_path.join("plans/older-plan.md"), "# Older plan\n").unwrap();
    std::fs::write(
        settings.join("settings.json"),
        format!(
            "{{\"basePath\":{:?},\"authoring\":\"html\"}}\n",
            base_path.display().to_string()
        ),
    )
    .unwrap();

    let mut server = Command::new(env!("CARGO_BIN_EXE_openplan"))
        .arg("mcp")
        .env("HOME", &home)
        .env_remove("XDG_CONFIG_HOME")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("the server should start");
    let mut stdin = server.stdin.take().unwrap();
    let mut lines = BufReader::new(server.stdout.take().unwrap()).lines();
    let mut ask = |message: &str| -> serde_json::Value {
        writeln!(stdin, "{message}").unwrap();
        let line = lines.next().expect("a reply").unwrap();
        serde_json::from_str(&line).expect("json-rpc")
    };

    ask(r##"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"1.0"}}}"##);

    // The mode reaches the agent before it writes anything.
    let tools = ask(r##"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"##);
    let create = tools["result"]["tools"][0]["description"].as_str().unwrap();
    assert!(create.contains("HTML document"), "{create}");

    let standards = ask(r##"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_standards","arguments":{}}}"##);
    let served = standards["result"]["content"][0]["text"].as_str().unwrap();
    assert!(served.starts_with("Authoring mode: html"), "{served}");

    let created = ask(
        r##"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Rendered plan","body":"<h1>Rendered plan</h1>\n<h2>Scope</h2>\n<h2>Findings</h2>\n<h2>Recommendations</h2>","type":"audit"}}}"##,
    );
    assert_eq!(created["result"]["isError"], false, "{created}");

    // The markdown plan already on disk still owns its id.
    let clash = ask(
        r##"{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Older plan","body":"<h1>Older plan</h1>"}}}"##,
    );
    assert_eq!(clash["result"]["isError"], true, "{clash}");

    let read = ask(r##"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"read_plan","arguments":{"id":"rendered-plan"}}}"##);
    let text = read["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.starts_with("<!--\n---\n"), "{text}");
    assert!(text.contains("\n-->\n<h1>Rendered plan</h1>"), "{text}");

    drop(stdin);
    server.wait().unwrap();

    let base = openplan_core::base::Base { root: base_path };
    let entries = openplan_core::library::scan(&base);
    assert_eq!(entries.len(), 2, "{entries:?}");
    let rendered = entries.iter().find(|e| e.meta.id == "rendered-plan").unwrap();
    assert_eq!(rendered.meta.title, "Rendered plan");
    assert_eq!(rendered.path.extension().unwrap(), "html");

    let _ = std::fs::remove_dir_all(&home);
}

/// With the app open, the same server registers the session, says which plan
/// it is on, and carries the person's comments into the next tool result.
#[cfg(unix)]
#[test]
fn a_session_registers_with_the_app_and_hears_about_comments() {
    use openplan_core::local::{CommentNote, Event, Notice, Server};
    use std::os::unix::net::UnixListener;
    use std::time::Duration;

    let home = std::env::temp_dir().join(format!("openplan-mcp-session-live-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&home);
    let base_path = home.join(openplan_core::profile::base_dir_name());
    let base = openplan_core::base::ensure_base(&base_path).unwrap();
    openplan_core::repo::init(&base.root).unwrap();
    openplan_core::repo::commit_all(
        &base.root,
        &openplan_core::repo::Author::user(),
        "init: plan base",
    )
    .unwrap();

    // The app is up before the session starts, which is how the client finds it.
    let (notices_in, notices) = std::sync::mpsc::channel();
    let server = Server::start(move |notice| {
        let _ = notices_in.send(notice);
    })
    .unwrap();
    let woke = move || loop {
        match notices.recv_timeout(Duration::from_secs(5)).expect("a notice") {
            Notice::Woke { ok, plans } => return (ok, plans),
            Notice::SessionsChanged => continue,
        }
    };

    // The session's inbox, which the harness hands the server it spawns.
    let socket = home.join("inbox.sock");
    std::fs::create_dir_all(&home).unwrap();
    let inbox = UnixListener::bind(&socket).unwrap();
    let (messages_in, messages) = std::sync::mpsc::channel::<Vec<serde_json::Value>>();
    std::thread::spawn(move || {
        for stream in inbox.incoming() {
            let lines = BufReader::new(stream.unwrap())
                .lines()
                .map(|line| serde_json::from_str(&line.unwrap()).unwrap())
                .collect();
            let _ = messages_in.send(lines);
        }
    });
    let settings = config_dir(&home).join(openplan_core::profile::name());
    std::fs::create_dir_all(&settings).unwrap();
    openplan_core::local::write_app(
        &settings.join("app.json"),
        &openplan_core::local::AppInfo {
            port: server.port,
            pid: std::process::id(),
        },
    )
    .unwrap();

    let mut mcp = Command::new(env!("CARGO_BIN_EXE_openplan"))
        .arg("mcp")
        .env("HOME", &home)
        .env_remove("XDG_CONFIG_HOME")
        .env("CLAUDE_CODE_MESSAGING_SOCKET", &socket)
        .env("CLAUDE_CODE_MESSAGING_TOKEN", "secret")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("the server should start");
    let mut stdin = mcp.stdin.take().unwrap();
    let mut lines = BufReader::new(mcp.stdout.take().unwrap()).lines();
    let mut ask = |message: &str| -> serde_json::Value {
        writeln!(stdin, "{message}").unwrap();
        let line = lines.next().expect("a reply").unwrap();
        serde_json::from_str(&line).expect("json-rpc")
    };

    ask(r##"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"1.0"}}}"##);
    let joined = server.sessions();
    assert_eq!(joined.len(), 1, "the app knows a session started: {joined:?}");
    assert_eq!(joined[0].client, "claude-code");
    assert!(joined[0].plans.is_empty(), "filing is not working on it");

    // The session that files a plan is on it, so the review reaches it.
    let created = ask(
        r##"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Auth refactor","body":"# Auth refactor"}}}"##,
    );
    assert_eq!(created["result"]["isError"], false, "{created}");
    assert_eq!(server.sessions()[0].plans, vec!["auth-refactor".to_string()]);

    // Reading it leaves the status where it was.
    let read = ask(r##"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_plan","arguments":{"id":"auth-refactor"}}}"##);
    assert_eq!(read["result"]["isError"], false, "{read}");
    assert_eq!(server.sessions()[0].plans, vec!["auth-refactor".to_string()]);
    let entry = openplan_core::library::scan(&base)
        .into_iter()
        .find(|e| e.meta.id == "auth-refactor")
        .unwrap();
    assert_eq!(entry.meta.status, openplan_core::plan::Status::Draft);

    // A review sent from the app reaches the session in its next tool result.
    let sent = server.send(
        "auth-refactor",
        Event::Comments {
            plan: "auth-refactor".to_string(),
            threads: vec![CommentNote {
                id: "t1".to_string(),
                quote: "Auth refactor".to_string(),
                line_start: 1,
                line_end: 1,
                text: "Say what breaks.".to_string(),
                author: "Sid".to_string(),
            }],
        },
    );
    assert_eq!(sent, 1);
    // An idle agent is woken with one short message, and the app hears so.
    let review_line = "OpenPlan: a review with 1 comment arrived on auth-refactor. Call get_comments.";
    let message = messages.recv_timeout(Duration::from_secs(5)).expect("a wake message");
    assert_eq!(message[0], serde_json::json!({ "type": "auth", "token": "secret" }));
    assert_eq!(message[1]["message"]["content"], review_line);
    assert_eq!(woke(), (true, vec!["auth-refactor".to_string()]));
    // Delivery rides the next call, so it is whichever call comes after it.
    let mut delivered = String::new();
    for _ in 0..200 {
        let listed = ask(r##"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}"##);
        let text = listed["result"]["content"][0]["text"].as_str().unwrap();
        if text.contains("New comments") {
            delivered = text.to_string();
            break;
        }
    }
    assert!(delivered.contains("New comments on auth-refactor"), "{delivered}");
    assert!(
        delivered.contains("thread t1 (lines 1-1): \"Auth refactor\""),
        "{delivered}"
    );
    assert!(delivered.contains("Say what breaks."), "{delivered}");
    assert!(delivered.contains("reply_comment"), "{delivered}");

    // ...and only once.
    let again = ask(r##"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}"##);
    assert!(!again["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("New comments"));

    // A hook asks the app what the agent has not seen yet, in either shape.
    let pending = |format: &str| -> String {
        let out = Command::new(env!("CARGO_BIN_EXE_openplan"))
            .args(["pending", "--client", "claude-code", "--format", format])
            .env("HOME", &home)
            .env_remove("XDG_CONFIG_HOME")
            .stdin(Stdio::null())
            .output()
            .unwrap();
        assert!(out.status.success());
        String::from_utf8(out.stdout).unwrap()
    };
    assert_eq!(pending("context"), "", "the review already reached the agent");
    server.send(
        "auth-refactor",
        Event::Build {
            plan: "auth-refactor".to_string(),
            threads: Vec::new(),
        },
    );
    let line = "OpenPlan: the person pressed Build on auth-refactor. Answer the open comments, then post every question left with ask_questions, or add todos, set in-progress and start.";
    assert_eq!(pending("context"), format!("{line}\n"));
    let stop: serde_json::Value = serde_json::from_str(&pending("stop")).unwrap();
    assert_eq!(stop["decision"], "block");
    assert_eq!(stop["reason"], line);
    let message = messages.recv_timeout(Duration::from_secs(5)).expect("a wake message");
    assert_eq!(message[1]["message"]["content"], line);
    assert_eq!(woke(), (true, vec!["auth-refactor".to_string()]));

    // The turn that wake starts does not hear it again from the prompt hook.
    let hook = Command::new(env!("CARGO_BIN_EXE_openplan"))
        .args(["pending", "--client", "claude-code", "--format", "context"])
        .env("HOME", &home)
        .env_remove("XDG_CONFIG_HOME")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let prompt = serde_json::json!({ "hook_event_name": "UserPromptSubmit", "prompt": line }).to_string();
    hook.stdin.as_ref().unwrap().write_all(prompt.as_bytes()).unwrap();
    let out = hook.wait_with_output().unwrap();
    assert_eq!(String::from_utf8(out.stdout).unwrap(), "");

    // The next tool call carries it, and after that the hook is quiet.
    let mut told = String::new();
    for _ in 0..200 {
        let listed = ask(r##"{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}"##);
        let text = listed["result"]["content"][0]["text"].as_str().unwrap().to_string();
        if text.contains("pressed Build") {
            told = text;
            break;
        }
    }
    assert!(told.contains("ask_questions"), "{told}");
    assert_eq!(pending("stop"), "");

    // The session ends when the client closes stdin.
    drop(stdin);
    mcp.wait().unwrap();
    assert!(server.sessions().is_empty(), "{:?}", server.sessions());

    server.shutdown();
    let _ = std::fs::remove_dir_all(&home);
}
