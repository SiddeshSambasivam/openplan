//! A whole MCP session against the real binary, the way an agent runs it:
//! spawned, spoken to over stdio, and judged by what lands in the base.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

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
            "create_plan", "list_plans", "set_status", "read_plan",
            "get_comments", "reply_comment", "resolve_comment", "get_standards"
        ]
    );
    let described = tools["result"]["tools"].to_string();
    for status in ["draft", "alignment", "in-progress", "in-review", "completed", "archived"] {
        assert!(described.contains(status), "the tools name every status: {status}");
    }

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
    let started = ask(r##"{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-progress"}}}"##);
    assert_eq!(started["result"]["isError"], false, "{started}");
    // Once the work has started, going back to alignment is the person's call.
    let back = ask(r##"{"jsonrpc":"2.0","id":18,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"alignment"}}}"##);
    assert_eq!(back["result"]["isError"], true, "{back}");

    // The agent cannot finish or put away a plan on the person's behalf.
    for status in ["completed", "archived"] {
        let refused = ask(&format!(
            r##"{{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{{"name":"set_status","arguments":{{"id":"auth-refactor","status":"{status}"}}}}}}"##
        ));
        assert_eq!(refused["result"]["isError"], true, "{status}: {refused}");
    }
    let moved = ask(r##"{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"set_status","arguments":{"id":"auth-refactor","status":"in-review"}}}"##);
    assert_eq!(moved["result"]["isError"], false, "{moved}");

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
    use openplan_core::local::{CommentNote, Event, Server};

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
    let server = Server::start(base.clone(), |_| {}).unwrap();
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

    // Filing a plan leaves it a draft and says nothing about a session.
    let created = ask(
        r##"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_plan","arguments":{"title":"Auth refactor","body":"# Auth refactor"}}}"##,
    );
    assert_eq!(created["result"]["isError"], false, "{created}");
    assert!(server.sessions()[0].plans.is_empty());

    // Reading one is. The plan moves with it.
    let read = ask(r##"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_plan","arguments":{"id":"auth-refactor"}}}"##);
    assert_eq!(read["result"]["isError"], false, "{read}");
    assert_eq!(server.sessions()[0].plans, vec!["auth-refactor".to_string()]);
    let entry = openplan_core::library::scan(&base)
        .into_iter()
        .find(|e| e.meta.id == "auth-refactor")
        .unwrap();
    assert_eq!(entry.meta.status, openplan_core::plan::Status::InProgress);

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

    // The session ends when the client closes stdin.
    drop(stdin);
    mcp.wait().unwrap();
    assert!(server.sessions().is_empty(), "{:?}", server.sessions());

    server.shutdown();
    let _ = std::fs::remove_dir_all(&home);
}
