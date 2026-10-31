//! The loopback server the app runs while it is open, and the client the MCP
//! server reaches it with. A session says who it is and which plans it is
//! working on; the app answers with the comments and status changes meant for
//! it. Nothing here is required for a plan to be filed: with no app listening
//! the client hands back nothing and every tool works against files alone.

use crate::base::Base;
use crate::import::iso_from_unix;
use crate::plan::{self, Status};
use crate::repo::{self, Author};
use crate::{fs, library, settings};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

/// A session that has gone quiet without saying goodbye is dropped, but only
/// when the next request gives us a reason to look. Long enough that a session
/// left open over lunch survives.
const IDLE_LIMIT: Duration = Duration::from_secs(6 * 60 * 60);

/// Bodies here are one short JSON object; anything larger is not ours.
const MAX_BODY: usize = 64 * 1024;

/// A dead port refuses at once on loopback, so this only bounds the case where
/// something answers the address and then says nothing.
const CONNECT_TIMEOUT: Duration = Duration::from_millis(250);
const REPLY_TIMEOUT: Duration = Duration::from_secs(3);

/// One review comment, as the session working on the plan needs to read it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentNote {
    pub id: String,
    pub quote: String,
    pub line_start: u32,
    pub line_end: u32,
    pub text: String,
    pub author: String,
}

/// What the app has to tell a session since it last asked.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Event {
    Comments {
        plan: String,
        threads: Vec<CommentNote>,
    },
    Status {
        plan: String,
        status: String,
    },
}

/// A session as the interface lists it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub client: String,
    pub plans: Vec<String>,
    pub since: String,
}

/// What the app should tell the interface after a request changed something.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Notice {
    /// A plan on disk moved.
    BaseChanged,
    /// Who is working, or on what, is different.
    SessionsChanged,
}

struct Session {
    client: String,
    plans: Vec<String>,
    since: String,
    events: Vec<Event>,
    /// When this session last spoke. Only consulted while nothing is waiting
    /// on its behalf, since a held-open poll is proof enough that it is there.
    seen: Instant,
    polling: bool,
}

#[derive(Default)]
struct State {
    sessions: HashMap<String, Session>,
    next: u64,
    stopped: bool,
}

/// The lock guards the sessions; the condition variable is what lets a poll
/// block instead of asking again on a timer.
type Shared = Arc<(Mutex<State>, Condvar)>;

pub(crate) fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    iso_from_unix(secs)
}

// ---------------------------------------------------------------- the server

pub struct Server {
    pub port: u16,
    shared: Shared,
}

impl Server {
    /// Binds loopback on a free port and serves until shutdown. `notify` runs
    /// on the connection's thread, so it should hand off rather than work.
    pub fn start(
        base: Base,
        notify: impl Fn(Notice) + Send + Sync + 'static,
    ) -> Result<Server, String> {
        let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
            .map_err(|e| format!("Couldn't start OpenPlan's local server: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Couldn't start OpenPlan's local server: {e}"))?
            .port();
        let shared: Shared = Arc::new((Mutex::new(State::default()), Condvar::new()));
        let served = shared.clone();
        let notify: Arc<dyn Fn(Notice) + Send + Sync> = Arc::new(notify);
        std::thread::spawn(move || {
            // Blocked on accept costs nothing; a connection gets its own
            // thread so one held-open poll never stalls the others.
            for stream in listener.incoming() {
                if served.0.lock().map(|s| s.stopped).unwrap_or(true) {
                    return;
                }
                let Ok(stream) = stream else { continue };
                let shared = served.clone();
                let base = base.clone();
                let notify = notify.clone();
                std::thread::spawn(move || handle(&shared, &base, notify.as_ref(), stream));
            }
        });
        Ok(Server { port, shared })
    }

    pub fn sessions(&self) -> Vec<SessionInfo> {
        let Ok(state) = self.shared.0.lock() else {
            return Vec::new();
        };
        listing(&state)
    }

    /// Hands an event to every session working on that plan, and says how many
    /// got it.
    pub fn send(&self, plan_id: &str, event: Event) -> usize {
        let (lock, waiting) = &*self.shared;
        let Ok(mut state) = lock.lock() else {
            return 0;
        };
        let mut sent = 0;
        for session in state.sessions.values_mut() {
            if session.plans.iter().any(|p| p == plan_id) {
                session.events.push(event.clone());
                sent += 1;
            }
        }
        waiting.notify_all();
        sent
    }

    /// Releases every held-open poll. The listener stops at its next
    /// connection, which for a process on its way out never comes.
    pub fn shutdown(&self) {
        let (lock, waiting) = &*self.shared;
        if let Ok(mut state) = lock.lock() {
            state.stopped = true;
        }
        waiting.notify_all();
    }
}

fn listing(state: &State) -> Vec<SessionInfo> {
    let mut sessions: Vec<SessionInfo> = state
        .sessions
        .iter()
        .map(|(id, session)| SessionInfo {
            id: id.clone(),
            client: session.client.clone(),
            plans: session.plans.clone(),
            since: session.since.clone(),
        })
        .collect();
    sessions.sort_by(|a, b| a.id.cmp(&b.id));
    sessions
}

/// Sessions that neither said goodbye nor left a poll open. Checked here
/// rather than on a timer, so an idle app wakes for nothing.
fn sweep(state: &mut State) {
    state
        .sessions
        .retain(|_, session| session.polling || session.seen.elapsed() < IDLE_LIMIT);
}

fn handle(shared: &Shared, base: &Base, notify: &dyn Fn(Notice), mut stream: TcpStream) {
    let Some(request) = read_request(&stream) else {
        let _ = respond(&mut stream, "400 Bad Request", "{}");
        return;
    };
    if let Ok(mut state) = shared.0.lock() {
        sweep(&mut state);
    }
    let segments: Vec<&str> = request.path.split('/').filter(|s| !s.is_empty()).collect();
    match (request.method.as_str(), segments.as_slice()) {
        ("POST", ["sessions"]) => open_session(shared, notify, &request.body, &mut stream),
        ("GET", ["sessions"]) => {
            let body = shared
                .0
                .lock()
                .map(|state| json_array(&listing(&state)))
                .unwrap_or_else(|_| "[]".to_string());
            let _ = respond(&mut stream, "200 OK", &format!("{{\"sessions\":{body}}}"));
        }
        ("DELETE", ["sessions", id]) => {
            let existed = end_session(shared, id);
            if existed {
                notify(Notice::SessionsChanged);
            }
            let _ = respond(&mut stream, if existed { "200 OK" } else { "404 Not Found" }, "{}");
        }
        ("POST", ["sessions", id, "plans"]) => {
            take_plan(shared, base, notify, id, &request.body, &mut stream)
        }
        ("GET", ["sessions", id, "events"]) => poll(shared, notify, id, &mut stream),
        _ => {
            let _ = respond(&mut stream, "404 Not Found", "{}");
        }
    }
}

fn open_session(shared: &Shared, notify: &dyn Fn(Notice), body: &str, stream: &mut TcpStream) {
    let client = field(body, "client").unwrap_or_else(|| "agent".to_string());
    let Ok(mut state) = shared.0.lock() else {
        let _ = respond(stream, "500 Internal Server Error", "{}");
        return;
    };
    state.next += 1;
    let id = format!("s{}", state.next);
    state.sessions.insert(
        id.clone(),
        Session {
            client,
            plans: Vec::new(),
            since: now_iso(),
            events: Vec::new(),
            seen: Instant::now(),
            polling: false,
        },
    );
    drop(state);
    notify(Notice::SessionsChanged);
    let _ = respond(stream, "200 OK", &format!("{{\"id\":{}}}", quoted(&id)));
}

fn end_session(shared: &Shared, id: &str) -> bool {
    let (lock, waiting) = &**shared;
    let Ok(mut state) = lock.lock() else {
        return false;
    };
    let existed = state.sessions.remove(id).is_some();
    waiting.notify_all();
    existed
}

fn take_plan(
    shared: &Shared,
    base: &Base,
    notify: &dyn Fn(Notice),
    id: &str,
    body: &str,
    stream: &mut TcpStream,
) {
    let Some(plan_id) = field(body, "id").filter(|p| !p.is_empty()) else {
        let _ = respond(stream, "400 Bad Request", "{}");
        return;
    };
    let client = {
        let Ok(mut state) = shared.0.lock() else {
            let _ = respond(stream, "500 Internal Server Error", "{}");
            return;
        };
        let Some(session) = state.sessions.get_mut(id) else {
            let _ = respond(stream, "404 Not Found", "{}");
            return;
        };
        session.seen = Instant::now();
        if !session.plans.iter().any(|p| p == &plan_id) {
            session.plans.push(plan_id.clone());
        }
        session.client.clone()
    };
    let moved = start_work(base, &client, &plan_id);
    notify(Notice::SessionsChanged);
    if moved {
        notify(Notice::BaseChanged);
    }
    let _ = respond(stream, "200 OK", "{}");
}

/// A draft someone is working on is in progress. Anything further along is
/// left where the person or the agent put it.
fn start_work(base: &Base, client: &str, plan_id: &str) -> bool {
    let Some(entry) = library::scan(base).into_iter().find(|e| e.meta.id == plan_id) else {
        return false;
    };
    if entry.meta.status != Status::Draft {
        return false;
    }
    let Ok(text) = fs::read_to_string(&entry.path) else {
        return false;
    };
    let mut parsed = plan::parse(&text, &entry.path);
    parsed.meta.status = Status::InProgress;
    parsed.meta.updated = Some(now_iso());
    if fs::atomic_write(&entry.path, &plan::serialize(&parsed)).is_err() {
        return false;
    }
    let _ = repo::commit_all(
        &base.root,
        &Author::agent_for(client, &settings::current_identity()),
        &format!("agent({client}): in-progress {plan_id}"),
    );
    true
}

/// Holds the connection until there is something to say. The wait is on a
/// condition variable, so a session with nothing happening costs one blocked
/// thread and no cycles.
fn poll(shared: &Shared, notify: &dyn Fn(Notice), id: &str, stream: &mut TcpStream) {
    let (lock, waiting) = &**shared;
    let Ok(mut state) = lock.lock() else {
        let _ = respond(stream, "500 Internal Server Error", "{}");
        return;
    };
    let Some(session) = state.sessions.get_mut(id) else {
        let _ = respond(stream, "404 Not Found", "{}");
        return;
    };
    session.polling = true;
    loop {
        let ready = state
            .sessions
            .get(id)
            .is_none_or(|session| !session.events.is_empty());
        if ready || state.stopped {
            break;
        }
        let Ok(next) = waiting.wait(state) else {
            return;
        };
        state = next;
    }
    let events = state
        .sessions
        .get_mut(id)
        .map(|session| {
            session.polling = false;
            session.seen = Instant::now();
            std::mem::take(&mut session.events)
        })
        .unwrap_or_default();
    drop(state);

    let body = format!("{{\"events\":{}}}", json_array(&events));
    if respond(stream, "200 OK", &body).is_err() {
        // Nobody is listening any more, so the session went with the socket.
        if end_session(shared, id) {
            notify(Notice::SessionsChanged);
        }
    }
}

// ------------------------------------------------------------------- the app

/// Where the app says it is listening. Written next to the settings, so one
/// profile's app and one profile's agents always find each other.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppInfo {
    pub port: u16,
    pub pid: u32,
}

pub fn app_path() -> Result<std::path::PathBuf, String> {
    let dir = dirs::config_dir()
        .ok_or_else(|| "Couldn't find this system's configuration directory.".to_string())?;
    Ok(dir.join(crate::profile::name()).join("app.json"))
}

pub fn write_app(path: &std::path::Path, info: &AppInfo) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Couldn't create the settings directory: {e}"))?;
    }
    let json = serde_json::to_string(info).map_err(|e| e.to_string())?;
    fs::atomic_write(path, &format!("{json}\n"))
}

/// Missing or unreadable means no app, which is the ordinary case.
pub fn read_app(path: &std::path::Path) -> Option<AppInfo> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

pub fn remove_app(path: &std::path::Path) {
    let _ = std::fs::remove_file(path);
}

// ---------------------------------------------------------------- the client

/// One session's end of the connection. Cloning it is how the poll runs on
/// its own thread while the tools keep using the same session.
#[derive(Debug, Clone)]
pub struct Client {
    port: u16,
    id: String,
}

/// Registers a session with the app, or `None` when no app is listening. A
/// file left behind by an app that is gone fails the same way, since the
/// handshake, not the file, is what proves anyone is there.
pub fn connect(client_name: &str) -> Option<Client> {
    let info = read_app(&app_path().ok()?)?;
    let body = format!("{{\"client\":{}}}", quoted(client_name));
    let reply = request(info.port, "POST", "/sessions", &body, Some(REPLY_TIMEOUT))?;
    Some(Client {
        port: info.port,
        id: field(&reply, "id")?,
    })
}

impl Client {
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Says this session is working on that plan. Best effort: an app that
    /// went away mid-session changes nothing about the tools.
    pub fn take_plan(&self, plan_id: &str) {
        let body = format!("{{\"id\":{}}}", quoted(plan_id));
        let path = format!("/sessions/{}/plans", self.id);
        let _ = request(self.port, "POST", &path, &body, Some(REPLY_TIMEOUT));
    }

    /// Blocks until the app has something for this session. `None` once the
    /// session is over, whichever side ended it.
    pub fn events(&self) -> Option<Vec<Event>> {
        let path = format!("/sessions/{}/events", self.id);
        let reply = request(self.port, "GET", &path, "", None)?;
        let events: EventsReply = serde_json::from_str(&reply).ok()?;
        Some(events.events)
    }

    pub fn end(&self) {
        let path = format!("/sessions/{}", self.id);
        let _ = request(self.port, "DELETE", &path, "", Some(REPLY_TIMEOUT));
    }
}

#[derive(Deserialize)]
struct EventsReply {
    events: Vec<Event>,
}

/// One request, one connection. `None` for anything that is not a plain 200,
/// which is also how "there is no app" arrives.
fn request(
    port: u16,
    method: &str,
    path: &str,
    body: &str,
    timeout: Option<Duration>,
) -> Option<String> {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = TcpStream::connect_timeout(&address, CONNECT_TIMEOUT).ok()?;
    stream.set_read_timeout(timeout).ok()?;
    write!(
        stream,
        "{method} {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .ok()?;
    stream.flush().ok()?;
    let mut text = String::new();
    stream.read_to_string(&mut text).ok()?;
    let (head, body) = text.split_once("\r\n\r\n")?;
    head.starts_with("HTTP/1.1 200").then(|| body.to_string())
}

// ------------------------------------------------------------------- plumbing

struct Request {
    method: String,
    path: String,
    body: String,
}

fn read_request(stream: &TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream);
    let mut start = String::new();
    reader.read_line(&mut start).ok()?;
    let mut parts = start.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();

    let mut length = 0usize;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).ok()? == 0 || header.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                length = value.trim().parse().unwrap_or(0);
            }
        }
    }
    if length > MAX_BODY {
        return None;
    }
    let mut body = vec![0u8; length];
    if length > 0 {
        reader.read_exact(&mut body).ok()?;
    }
    Some(Request {
        method,
        path,
        body: String::from_utf8(body).ok()?,
    })
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    stream.flush()
}

fn quoted(text: &str) -> String {
    serde_json::Value::String(text.to_string()).to_string()
}

fn json_array<T: Serialize>(values: &[T]) -> String {
    serde_json::to_string(values).unwrap_or_else(|_| "[]".to_string())
}

/// One string field out of a small JSON object, which is all any body here
/// carries.
fn field(body: &str, name: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()?
        .get(name)?
        .as_str()
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::base::ensure_base;
    use crate::plan::PlanMeta;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        // Named per process: every checkout on this machine shares one
        // temp directory, and a fixed name lets one run wipe another's.
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn a_base(name: &str) -> (std::path::PathBuf, Base) {
        let dir = temp_dir(name);
        let base = ensure_base(&dir.join("base")).unwrap();
        repo::init(&base.root).unwrap();
        (dir, base)
    }

    fn file_a_draft(base: &Base, id: &str) {
        let filed = plan::Plan {
            meta: PlanMeta {
                id: id.to_string(),
                title: "Auth refactor".to_string(),
                status: Status::Draft,
                plan_type: None,
                source: "claude-code".to_string(),
                project: None,
                pr: None,
                created: Some("2026-09-22T09:00:00Z".to_string()),
                updated: Some("2026-09-22T09:00:00Z".to_string()),
            },
            frontmatter: Vec::new(),
            body: "# Auth refactor\n".to_string(),
            derived: false,
            html: false,
        };
        fs::atomic_write(&base.plans_dir().join(format!("{id}.md")), &plan::serialize(&filed))
            .unwrap();
        repo::commit_all(&base.root, &Author::user(), "init: plan base").unwrap();
    }

    fn status_of(base: &Base, id: &str) -> Status {
        library::scan(base)
            .into_iter()
            .find(|e| e.meta.id == id)
            .unwrap()
            .meta
            .status
    }

    #[test]
    fn a_session_taking_a_draft_puts_it_in_progress_under_the_agents_name() {
        let (dir, base) = a_base("openplan-core-local-take");
        file_a_draft(&base, "auth-refactor");
        let server = Server::start(base.clone(), |_| {}).unwrap();

        let client = {
            let body = "{\"client\":\"claude-code\"}";
            let reply = request(server.port, "POST", "/sessions", body, Some(REPLY_TIMEOUT)).unwrap();
            Client {
                port: server.port,
                id: field(&reply, "id").unwrap(),
            }
        };
        client.take_plan("auth-refactor");

        let sessions = server.sessions();
        assert_eq!(sessions.len(), 1, "{sessions:?}");
        assert_eq!(sessions[0].client, "claude-code");
        assert_eq!(sessions[0].plans, vec!["auth-refactor".to_string()]);
        assert_eq!(status_of(&base, "auth-refactor"), Status::InProgress);

        let history =
            repo::history(&base.root, std::path::Path::new("plans/auth-refactor.md")).unwrap();
        assert_eq!(history[0].author, "claude-code");
        assert_eq!(history[0].message, "agent(claude-code): in-progress auth-refactor");

        // Saying goodbye takes the session off the board.
        client.end();
        assert!(server.sessions().is_empty());

        server.shutdown();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_poll_waits_for_an_event_and_takes_it_only_once() {
        let (dir, base) = a_base("openplan-core-local-poll");
        file_a_draft(&base, "auth-refactor");
        let server = Server::start(base.clone(), |_| {}).unwrap();
        let reply = request(
            server.port,
            "POST",
            "/sessions",
            "{\"client\":\"codex\"}",
            Some(REPLY_TIMEOUT),
        )
        .unwrap();
        let client = Client {
            port: server.port,
            id: field(&reply, "id").unwrap(),
        };
        client.take_plan("auth-refactor");

        // The poll may already be blocked or may not have started; an event
        // is queued on the session either way, so neither order can lose it.
        let polling = client.clone();
        let reader = std::thread::spawn(move || polling.events());
        let sent = server.send(
            "auth-refactor",
            Event::Comments {
                plan: "auth-refactor".to_string(),
                threads: vec![CommentNote {
                    id: "t1".to_string(),
                    quote: "why".to_string(),
                    line_start: 3,
                    line_end: 4,
                    text: "explain this choice".to_string(),
                    author: "Sid".to_string(),
                }],
            },
        );
        assert_eq!(sent, 1);

        let events = reader.join().unwrap().unwrap();
        assert_eq!(
            events,
            vec![Event::Comments {
                plan: "auth-refactor".to_string(),
                threads: vec![CommentNote {
                    id: "t1".to_string(),
                    quote: "why".to_string(),
                    line_start: 3,
                    line_end: 4,
                    text: "explain this choice".to_string(),
                    author: "Sid".to_string(),
                }],
            }]
        );

        // Nothing is left behind for the next poll to read twice.
        server.send(
            "auth-refactor",
            Event::Status {
                plan: "auth-refactor".to_string(),
                status: "in-review".to_string(),
            },
        );
        assert_eq!(
            client.events().unwrap(),
            vec![Event::Status {
                plan: "auth-refactor".to_string(),
                status: "in-review".to_string(),
            }]
        );

        server.shutdown();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_plan_nobody_is_working_on_gets_nothing_and_a_plan_past_draft_is_left_alone() {
        let (dir, base) = a_base("openplan-core-local-quiet");
        file_a_draft(&base, "auth-refactor");
        // Already in review: a session opening it should not walk it back.
        let entry = library::scan(&base).into_iter().next().unwrap();
        let text = fs::read_to_string(&entry.path).unwrap();
        let mut parsed = plan::parse(&text, &entry.path);
        parsed.meta.status = Status::InReview;
        fs::atomic_write(&entry.path, &plan::serialize(&parsed)).unwrap();

        let server = Server::start(base.clone(), |_| {}).unwrap();
        let reply = request(
            server.port,
            "POST",
            "/sessions",
            "{\"client\":\"cursor\"}",
            Some(REPLY_TIMEOUT),
        )
        .unwrap();
        let client = Client {
            port: server.port,
            id: field(&reply, "id").unwrap(),
        };
        client.take_plan("auth-refactor");

        assert_eq!(status_of(&base, "auth-refactor"), Status::InReview);
        let elsewhere = Event::Status {
            plan: "some-other-plan".to_string(),
            status: "draft".to_string(),
        };
        assert_eq!(server.send("some-other-plan", elsewhere), 0);

        server.shutdown();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn with_no_app_listening_a_client_is_simply_absent() {
        let dir = temp_dir("openplan-core-local-absent");
        let path = dir.join("app.json");
        assert_eq!(read_app(&path), None);
        write_app(&path, &AppInfo { port: 1, pid: 2 }).unwrap();
        assert_eq!(read_app(&path), Some(AppInfo { port: 1, pid: 2 }));
        // Port 1 answers nothing, which is what a stale file looks like.
        assert!(request(1, "GET", "/sessions", "", Some(Duration::from_millis(50))).is_none());
        remove_app(&path);
        assert_eq!(read_app(&path), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn events_travel_as_the_shapes_the_client_reads() {
        let comments = Event::Comments {
            plan: "auth-refactor".to_string(),
            threads: vec![CommentNote {
                id: "t1".to_string(),
                quote: "why".to_string(),
                line_start: 3,
                line_end: 4,
                text: "explain".to_string(),
                author: "Sid".to_string(),
            }],
        };
        let json = serde_json::to_string(&comments).unwrap();
        assert!(json.contains("\"kind\":\"comments\""), "{json}");
        assert!(json.contains("\"lineStart\":3"), "{json}");
        assert_eq!(serde_json::from_str::<Event>(&json).unwrap(), comments);

        let status = Event::Status {
            plan: "auth-refactor".to_string(),
            status: "in-review".to_string(),
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"kind\":\"status\""), "{json}");
        assert_eq!(serde_json::from_str::<Event>(&json).unwrap(), status);
    }
}
