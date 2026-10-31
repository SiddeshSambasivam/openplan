//! A whole MCP session against the real binary, the way an agent runs it:
//! spawned, spoken to over stdio, and judged by what lands in the base.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

#[test]
fn an_agent_can_file_a_plan_and_read_it_back() {
    let home = std::env::temp_dir().join("openplan-mcp-session");
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
            "create_plan", "list_plans", "set_status", "read_plan",
            "get_comments", "reply_comment", "resolve_comment", "get_standards"
        ]
    );

    let standards = ask(r##"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_standards","arguments":{}}}"##);
    assert!(standards["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Plan standards"));

    let created = ask(
        r##"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Auth refactor","body":"# Auth refactor\n\n## Context\n\nwhy","project":"github.com/acme/api","type":"feature"}}}"##,
    );
    assert_eq!(created["result"]["isError"], false, "{created}");

    // Filing the same title again is refused, not overwritten.
    let dup = ask(
        r##"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Auth refactor","body":"other"}}}"##,
    );
    assert_eq!(dup["result"]["isError"], true);

    let listed = ask(r##"{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}"##);
    assert!(listed["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("[draft] auth-refactor Auth refactor"));

    // The agent cannot finish a plan on the person's behalf...
    let finished = ask(r##"{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"completed"}}}"##);
    assert_eq!(finished["result"]["isError"], true, "{finished}");
    // ...nor send it for review without saying where the PR is.
    let no_pr = ask(r##"{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-review"}}}"##);
    assert_eq!(no_pr["result"]["isError"], true, "{no_pr}");
    let moved = ask(r##"{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-review","pr":"https://github.com/acme/api/pull/4"}}}"##);
    assert_eq!(moved["result"]["isError"], false, "{moved}");

    let read = ask(r##"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"read_plan","arguments":{"id":"auth-refactor"}}}"##);
    let text = read["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("source: claude-code"), "client name normalised: {text}");
    assert!(text.contains("project: github.com/acme/api"));
    assert!(text.contains("type: feature"), "{text}");
    assert!(text.contains("status: in-review"), "{text}");
    assert!(text.contains("pr: https://github.com/acme/api/pull/4"), "{text}");

    // The user leaves a review comment the way the app writes one...
    // Whichever build this is, the server puts its base where that
    // build looks for it.
    let base_root = home.join(openplan_core::profile::base_dir_name());
    let plan_path = base_root.join("plans/auth-refactor.md");
    openplan_core::comments::write_threads(
        &plan_path,
        &[openplan_core::comments::CommentThread {
            id: "t1".to_string(),
            quote: "why".to_string(),
            line_start: 10,
            line_end: 10,
            resolved: false,
            comments: vec![openplan_core::comments::CommentEntry {
                id: "c1".to_string(),
                text: "explain this choice".to_string(),
                created_at: "2026-08-16T12:00:00Z".to_string(),
                edited_at: None,
                author: "user".to_string(),
                author_name: Some("Sid".to_string()),
                author_email: Some("sid@hypotenuse.ai".to_string()),
            }],
        }],
    )
    .unwrap();

    // ...and the agent reads it, replies, and resolves it.
    let review = ask(r##"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_comments","arguments":{"id":"auth-refactor"}}}"##);
    let review_text = review["result"]["content"][0]["text"].as_str().unwrap();
    assert!(review_text.contains("thread t1"), "{review_text}");
    assert!(review_text.contains("explain this choice"));
    // The agent is told who is asking, by name rather than by role.
    assert!(review_text.contains("**Comment (Sid):**"), "{review_text}");

    let replied = ask(r##"{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"reply_comment","arguments":{"id":"auth-refactor","thread_id":"t1","text":"Because the schema owns the wire shape."}}}"##);
    assert_eq!(replied["result"]["isError"], false, "{replied}");

    let resolved = ask(r##"{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"resolve_comment","arguments":{"id":"auth-refactor","thread_id":"t1"}}}"##);
    assert_eq!(resolved["result"]["isError"], false, "{resolved}");

    let threads = openplan_core::comments::read_threads(&plan_path);
    assert!(threads[0].resolved);
    assert_eq!(threads[0].comments[1].author, "claude-code");
    // The tool signs its own name, against the person whose base it ran on.
    assert!(threads[0].comments[1].author_name.is_none());
    assert!(threads[0].comments[1].author_email.is_some());

    drop(stdin);
    server.wait().unwrap();

    // What reached disk is a plan the app would list, attributed in history.
    let base = openplan_core::base::Base { root: base_root.clone() };
    let entries = openplan_core::library::scan(&base);
    assert_eq!(entries.len(), 1);
    let history =
        openplan_core::repo::history(&base.root, std::path::Path::new("plans/auth-refactor.md"))
            .unwrap();
    assert_eq!(history[0].author, "claude-code");

    let _ = std::fs::remove_dir_all(&home);
}
