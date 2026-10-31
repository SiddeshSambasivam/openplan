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
            "create_plan", "list_plans", "tag_plan", "read_plan",
            "get_comments", "reply_comment", "resolve_comment", "get_standards"
        ]
    );

    let standards = ask(r##"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_standards","arguments":{}}}"##);
    assert!(standards["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Plan standards"));

    let created = ask(
        r##"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Auth refactor","body":"# Auth refactor\n\n## Context\n\nwhy","project":"~/work/api","tags":["auth"]}}}"##,
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
        .contains("auth-refactor [auth] Auth refactor"));

    let tagged = ask(r##"{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"tag_plan","arguments":{"id":"auth-refactor","tags":["auth","needs-review"]}}}"##);
    assert_eq!(tagged["result"]["isError"], false, "{tagged}");

    let read = ask(r##"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"read_plan","arguments":{"id":"auth-refactor"}}}"##);
    let text = read["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("source: claude-code"), "client name normalised: {text}");
    assert!(text.contains("project: ~/work/api"));
    assert!(text.contains("tags: auth, needs-review"), "{text}");

    // The user leaves a review comment the way the app writes one...
    let base_root = home.join(".openplan");
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
            }],
        }],
    )
    .unwrap();

    // ...and the agent reads it, replies, and resolves it.
    let review = ask(r##"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_comments","arguments":{"id":"auth-refactor"}}}"##);
    let review_text = review["result"]["content"][0]["text"].as_str().unwrap();
    assert!(review_text.contains("thread t1"), "{review_text}");
    assert!(review_text.contains("explain this choice"));

    let replied = ask(r##"{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"reply_comment","arguments":{"id":"auth-refactor","thread_id":"t1","text":"Because the schema owns the wire shape."}}}"##);
    assert_eq!(replied["result"]["isError"], false, "{replied}");

    let resolved = ask(r##"{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"resolve_comment","arguments":{"id":"auth-refactor","thread_id":"t1"}}}"##);
    assert_eq!(resolved["result"]["isError"], false, "{resolved}");

    let threads = openplan_core::comments::read_threads(&plan_path);
    assert!(threads[0].resolved);
    assert_eq!(threads[0].comments[1].author, "claude-code");

    drop(stdin);
    server.wait().unwrap();

    // What reached disk is a plan the app would list, attributed in history.
    let base = openplan_core::base::Base { root: home.join(".openplan") };
    let entries = openplan_core::library::scan(&base);
    assert_eq!(entries.len(), 1);
    let history =
        openplan_core::repo::history(&base.root, std::path::Path::new("plans/auth-refactor.md"))
            .unwrap();
    assert_eq!(history[0].author, "claude-code");

    let _ = std::fs::remove_dir_all(&home);
}
