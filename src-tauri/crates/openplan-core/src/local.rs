//! The loopback server the app runs while it is open, and the client the MCP
//! server reaches it with. A session says who it is and which plans it is
//! working on; the app answers with the comments and status changes meant for
//! it. Nothing here is required for a plan to be filed: with no app listening
//! the client hands back nothing and every tool works against files alone.
//! Being on a plan never moves it: a session only counts who is working.

use crate::fs;
use crate::import::now_iso;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
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
    /// The person pressed Build. The threads are the review comments that
    /// were still unsent, which went out with it.
    Build {
        plan: String,
        threads: Vec<CommentNote>,
    },
    /// The person answered posted questions in the app.
    Answers {
        plan: String,
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
#[derive(Debug, Clone, PartialEq)]
pub enum Notice {
    /// Who is working, or on what, is different.
    SessionsChanged,
    /// A session tried to start its agent's turn, on the plans it is on.
    Woke { ok: bool, plans: Vec<String> },
}

/// What one poll hands a session: the events, and whether the person wants
/// its agent woken for them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Polled {
    pub events: Vec<Event>,
    #[serde(default)]
    pub wake: bool,
}

struct Session {
    client: String,
    plans: Vec<String>,
    since: String,
    events: Vec<Event>,
    /// Sent but not yet in front of the agent: the poll has taken them, and
    /// no tool result has carried them yet. A hook reads these.
    unheard: Vec<Event>,
    /// When this session last spoke. Only consulted while nothing is waiting
    /// on its behalf, since a held-open poll is proof enough that it is there.
    seen: Instant,
    polling: bool,
}

struct State {
    sessions: HashMap<String, Session>,
    /// Events sent to a plan nobody was on, by plan, for the first session
    /// that takes it.
    held: HashMap<String, Vec<Event>>,
    next: u64,
    stopped: bool,
    wake: bool,
}

impl Default for State {
    fn default() -> Self {
        State {
            sessions: HashMap::new(),
            held: HashMap::new(),
            next: 0,
            stopped: false,
            wake: true,
        }
    }
}

/// The lock guards the sessions; the condition variable is what lets a poll
/// block instead of asking again on a timer.
type Shared = Arc<(Mutex<State>, Condvar)>;

// ---------------------------------------------------------------- the server

pub struct Server {
    pub port: u16,
    shared: Shared,
}

impl Server {
    /// Binds loopback on a free port and serves until shutdown. `notify` runs
    /// on the connection's thread, so it should hand off rather than work.
    pub fn start(notify: impl Fn(Notice) + Send + Sync + 'static) -> Result<Server, String> {
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
                let notify = notify.clone();
                std::thread::spawn(move || handle(&shared, notify.as_ref(), stream));
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
    /// got it. With none, the event waits for the next session on the plan.
    pub fn send(&self, plan_id: &str, event: Event) -> usize {
        let (lock, waiting) = &*self.shared;
        let Ok(mut state) = lock.lock() else {
            return 0;
        };
        let mut sent = 0;
        for session in state.sessions.values_mut() {
            if session.plans.iter().any(|p| p == plan_id) {
                session.events.push(event.clone());
                session.unheard.push(event.clone());
                sent += 1;
            }
        }
        // A status change is stale by the time a session arrives, and the plan
        // file already says where it stands.
        if sent == 0 && !matches!(event, Event::Status { .. }) {
            state.held.entry(plan_id.to_string()).or_default().push(event);
        }
        waiting.notify_all();
        sent
    }

    /// Whether polls ask sessions to start their agent's turn.
    pub fn set_wake(&self, on: bool) {
        if let Ok(mut state) = self.shared.0.lock() {
            state.wake = on;
        }
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

fn handle(shared: &Shared, notify: &dyn Fn(Notice), mut stream: TcpStream) {
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
        ("POST", ["sessions", id, "plans"]) => take_plan(shared, notify, id, &request.body, &mut stream),
        ("GET", ["sessions", id, "events"]) => poll(shared, notify, id, &mut stream),
        ("GET", ["sessions", id, "pending"]) => pending_events(shared, id, &mut stream),
        ("POST", ["sessions", id, "heard"]) => heard(shared, id, &request.body, &mut stream),
        ("POST", ["sessions", id, "woke"]) => woke(shared, notify, id, &request.body, &mut stream),
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
            unheard: Vec::new(),
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
    notify: &dyn Fn(Notice),
    id: &str,
    body: &str,
    stream: &mut TcpStream,
) {
    let Some(plan_id) = field(body, "id").filter(|p| !p.is_empty()) else {
        let _ = respond(stream, "400 Bad Request", "{}");
        return;
    };
    {
        let (lock, waiting) = &**shared;
        let Ok(mut guard) = lock.lock() else {
            let _ = respond(stream, "500 Internal Server Error", "{}");
            return;
        };
        let state = &mut *guard;
        let Some(session) = state.sessions.get_mut(id) else {
            let _ = respond(stream, "404 Not Found", "{}");
            return;
        };
        session.seen = Instant::now();
        if let Some(held) = state.held.remove(&plan_id) {
            session.events.extend(held.iter().cloned());
            session.unheard.extend(held);
            waiting.notify_all();
        }
        if !session.plans.iter().any(|p| p == &plan_id) {
            session.plans.push(plan_id);
        }
    }
    notify(Notice::SessionsChanged);
    let _ = respond(stream, "200 OK", "{}");
}

/// What a hook would tell the agent now. Answers at once and takes nothing,
/// so the next tool call still carries the same events.
fn pending_events(shared: &Shared, id: &str, stream: &mut TcpStream) {
    let events = shared
        .0
        .lock()
        .ok()
        .and_then(|state| state.sessions.get(id).map(|s| s.unheard.clone()));
    let _ = match events {
        Some(events) => respond(stream, "200 OK", &format!("{{\"events\":{}}}", json_array(&events))),
        None => respond(stream, "404 Not Found", "{}"),
    };
}

/// The session put this many of its oldest events in front of the agent.
/// The poll hands events over in the order they were sent, so the oldest are
/// the ones it means.
fn heard(shared: &Shared, id: &str, body: &str, stream: &mut TcpStream) {
    let count = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("count")?.as_u64())
        .unwrap_or(0) as usize;
    let found = shared.0.lock().ok().and_then(|mut state| {
        let session = state.sessions.get_mut(id)?;
        let count = count.min(session.unheard.len());
        session.unheard.drain(..count);
        Some(())
    });
    let status = if found.is_some() { "200 OK" } else { "404 Not Found" };
    let _ = respond(stream, status, "{}");
}

/// The session tried to start its agent's turn. Only the interface cares, so
/// this answers and passes it on.
fn woke(shared: &Shared, notify: &dyn Fn(Notice), id: &str, body: &str, stream: &mut TcpStream) {
    let ok = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("ok")?.as_bool())
        .unwrap_or(false);
    let plans = shared
        .0
        .lock()
        .ok()
        .and_then(|state| state.sessions.get(id).map(|s| s.plans.clone()));
    let Some(plans) = plans else {
        let _ = respond(stream, "404 Not Found", "{}");
        return;
    };
    let _ = respond(stream, "200 OK", "{}");
    notify(Notice::Woke { ok, plans });
}

/// Holds the connection until there is something to say, or until the client
/// hangs up. A killed client never says goodbye, so its socket closing is the
/// only sign it left. Both waits block, so a session with nothing happening
/// costs two blocked threads and no cycles.
fn poll(shared: &Shared, notify: &dyn Fn(Notice), id: &str, stream: &mut TcpStream) {
    let Ok(socket) = stream.try_clone() else {
        let _ = respond(stream, "500 Internal Server Error", "{}");
        return;
    };
    let hung_up = &AtomicBool::new(false);
    let heard = std::thread::scope(|scope| {
        scope.spawn(move || watch_for_hang_up(shared, socket, hung_up));
        let heard = answer_poll(shared, id, hung_up, stream);
        // Ends the watcher's read, so the scope never waits on the client.
        let _ = stream.shutdown(Shutdown::Both);
        heard
    });
    // Nobody is listening any more, so the session went with the socket.
    if !heard && end_session(shared, id) {
        notify(Notice::SessionsChanged);
    }
}

/// The poll's own wait. Says whether the client is still there to hear it.
fn answer_poll(shared: &Shared, id: &str, hung_up: &AtomicBool, stream: &mut TcpStream) -> bool {
    let (lock, waiting) = &**shared;
    let Ok(mut state) = lock.lock() else {
        return respond(stream, "500 Internal Server Error", "{}").is_ok();
    };
    let Some(session) = state.sessions.get_mut(id) else {
        return respond(stream, "404 Not Found", "{}").is_ok();
    };
    session.polling = true;
    loop {
        // A write to a closed socket can still succeed, so the reply is no
        // proof the client heard it.
        if hung_up.load(Ordering::Relaxed) {
            return false;
        }
        let ready = state
            .sessions
            .get(id)
            .is_none_or(|session| !session.events.is_empty());
        if ready || state.stopped {
            break;
        }
        let Ok(next) = waiting.wait(state) else {
            return true;
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
    let polled = Polled {
        events,
        wake: state.wake,
    };
    drop(state);

    let body = serde_json::to_string(&polled).unwrap_or_else(|_| "{\"events\":[]}".to_string());
    respond(stream, "200 OK", &body).is_ok()
}

/// A client sends nothing after its poll, so this read returns only when the
/// client hangs up or the poll shuts the socket after answering. A poll that
/// already answered no longer looks at the flag, so its next poll is safe.
fn watch_for_hang_up(shared: &Shared, mut socket: TcpStream, hung_up: &AtomicBool) {
    let _ = std::io::copy(&mut socket, &mut std::io::sink());
    let (lock, waiting) = &**shared;
    // Set under the lock, so the poll cannot check the flag and then sleep
    // through the wake.
    let _state = lock.lock();
    hung_up.store(true, Ordering::Relaxed);
    waiting.notify_all();
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
#[derive(Debug, Clone, PartialEq)]
pub struct Client {
    port: u16,
    id: String,
}

/// Registers a session with the app that `app` says is listening, or `None`
/// when none is. A file left behind by an app that is gone fails the same
/// way, since the handshake, not the file, is what proves anyone is there.
pub fn connect(app: &std::path::Path, client_name: &str) -> Option<Client> {
    let info = read_app(app)?;
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

    /// Says the latest tool result carried this many events, so a hook stops
    /// repeating them. Best effort, like `take_plan`.
    pub fn heard(&self, count: usize) {
        let path = format!("/sessions/{}/heard", self.id);
        let body = format!("{{\"count\":{count}}}");
        let _ = request(self.port, "POST", &path, &body, Some(REPLY_TIMEOUT));
    }

    /// Says whether this session managed to start its agent's turn. Best
    /// effort, like `take_plan`.
    pub fn woke(&self, ok: bool) {
        let path = format!("/sessions/{}/woke", self.id);
        let body = format!("{{\"ok\":{ok}}}");
        let _ = request(self.port, "POST", &path, &body, Some(REPLY_TIMEOUT));
    }

    /// Blocks until the app has something for this session. `None` once the
    /// session is over, whichever side ended it.
    pub fn events(&self) -> Option<Polled> {
        let path = format!("/sessions/{}/events", self.id);
        let reply = request(self.port, "GET", &path, "", None)?;
        serde_json::from_str(&reply).ok()
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

#[derive(Deserialize)]
struct SessionsReply {
    sessions: Vec<SessionInfo>,
}

/// What the app has sent a session that its agent has not seen yet, for a
/// hook to print. Empty when no app is open. One short request and no
/// retries, because a hook runs on every turn.
pub fn pending(client_name: &str, session: Option<&str>) -> Vec<Event> {
    let Some(info) = app_path().ok().and_then(|path| read_app(&path)) else {
        return Vec::new();
    };
    pending_at(info.port, client_name, session)
}

/// The named session, or the newest one of that client working on a plan.
fn pending_at(port: u16, client_name: &str, session: Option<&str>) -> Vec<Event> {
    let Some(id) = session
        .map(str::to_string)
        .or_else(|| newest_session(port, client_name))
    else {
        return Vec::new();
    };
    request(port, "GET", &format!("/sessions/{id}/pending"), "", Some(REPLY_TIMEOUT))
        .and_then(|reply| serde_json::from_str::<EventsReply>(&reply).ok())
        .map(|reply| reply.events)
        .unwrap_or_default()
}

fn newest_session(port: u16, client_name: &str) -> Option<String> {
    let reply = request(port, "GET", "/sessions", "", Some(REPLY_TIMEOUT))?;
    let listed: SessionsReply = serde_json::from_str(&reply).ok()?;
    listed
        .sessions
        .into_iter()
        .filter(|s| s.client == client_name && !s.plans.is_empty())
        // Ids count up from s1, so the highest number opened last.
        .max_by_key(|s| s.id.trim_start_matches('s').parse::<u64>().unwrap_or(0))
        .map(|s| s.id)
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
    use crate::base::{ensure_base, Base};
    use crate::library;
    use crate::plan::{self, PlanMeta, Status};
    use crate::repo::{self, Author};

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
                folders: Vec::new(),
                pr: None,
                created: Some("2026-09-22T09:00:00Z".to_string()),
                updated: Some("2026-09-22T09:00:00Z".to_string()),
                completed: None,
                demo: false,
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

    fn open(server: &Server, client_name: &str) -> Client {
        let body = format!("{{\"client\":{}}}", quoted(client_name));
        let reply = request(server.port, "POST", "/sessions", &body, Some(REPLY_TIMEOUT)).unwrap();
        Client {
            port: server.port,
            id: field(&reply, "id").unwrap(),
        }
    }

    fn build(plan: &str) -> Event {
        Event::Build {
            plan: plan.to_string(),
            threads: Vec::new(),
        }
    }

    #[test]
    fn a_session_taking_a_plan_is_counted_and_leaves_its_status_alone() {
        let (dir, base) = a_base("openplan-core-local-take");
        file_a_draft(&base, "auth-refactor");
        let server = Server::start(|_| {}).unwrap();

        let client = open(&server, "claude-code");
        client.take_plan("auth-refactor");

        let sessions = server.sessions();
        assert_eq!(sessions.len(), 1, "{sessions:?}");
        assert_eq!(sessions[0].client, "claude-code");
        assert_eq!(sessions[0].plans, vec!["auth-refactor".to_string()]);
        // Presence says who is live. Only a guarded call moves a plan.
        assert_eq!(status_of(&base, "auth-refactor"), Status::Draft);
        let history =
            repo::history(&base.root, std::path::Path::new("plans/auth-refactor.md")).unwrap();
        assert_eq!(history.len(), 1, "{history:?}");

        // Saying goodbye takes the session off the board.
        client.end();
        assert!(server.sessions().is_empty());

        server.shutdown();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pending_answers_at_once_and_leaves_the_events_for_the_next_tool_call() {
        let server = Server::start(|_| {}).unwrap();
        let client = open(&server, "claude-code");
        client.take_plan("auth-refactor");

        // Nothing waiting is an empty answer, not a held connection.
        assert_eq!(pending_at(server.port, "claude-code", None), Vec::<Event>::new());

        server.send("auth-refactor", build("auth-refactor"));
        // The session's own poll takes the event, and the hook still sees it.
        assert_eq!(client.events().unwrap().events, vec![build("auth-refactor")]);
        assert_eq!(pending_at(server.port, "claude-code", None), vec![build("auth-refactor")]);
        assert_eq!(pending_at(server.port, "claude-code", None), vec![build("auth-refactor")]);

        // Once a tool result carried it, the hook has nothing left to say.
        client.heard(1);
        assert_eq!(pending_at(server.port, "claude-code", None), Vec::<Event>::new());

        server.shutdown();
    }

    #[test]
    fn pending_asks_the_newest_session_of_that_client_working_on_a_plan() {
        let server = Server::start(|_| {}).unwrap();
        let older = open(&server, "claude-code");
        older.take_plan("old-plan");
        let newer = open(&server, "claude-code");
        newer.take_plan("new-plan");
        let idle = open(&server, "claude-code");
        let cursor = open(&server, "cursor");
        cursor.take_plan("cursor-plan");
        for plan in ["old-plan", "new-plan", "cursor-plan"] {
            server.send(plan, build(plan));
        }

        assert_eq!(pending_at(server.port, "claude-code", None), vec![build("new-plan")]);
        assert_eq!(pending_at(server.port, "cursor", None), vec![build("cursor-plan")]);
        assert_eq!(
            pending_at(server.port, "claude-code", Some(older.id())),
            vec![build("old-plan")]
        );
        assert_eq!(pending_at(server.port, "codex", None), Vec::<Event>::new());
        assert_eq!(pending_at(server.port, "claude-code", Some(idle.id())), Vec::<Event>::new());

        server.shutdown();
    }

    #[test]
    fn a_poll_waits_for_an_event_and_takes_it_only_once() {
        let (dir, base) = a_base("openplan-core-local-poll");
        file_a_draft(&base, "auth-refactor");
        let server = Server::start(|_| {}).unwrap();
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

        let events = reader.join().unwrap().unwrap().events;
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
            client.events().unwrap().events,
            vec![Event::Status {
                plan: "auth-refactor".to_string(),
                status: "in-review".to_string(),
            }]
        );

        server.shutdown();
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A server whose notices arrive on a channel, so a test can wait for one.
    fn a_listened_server() -> (Server, std::sync::mpsc::Receiver<Notice>) {
        let (tx, rx) = std::sync::mpsc::channel();
        let server = Server::start(move |notice| {
            let _ = tx.send(notice);
        })
        .unwrap();
        (server, rx)
    }

    #[test]
    fn a_client_that_hangs_up_mid_poll_leaves_the_board() {
        let (server, notices) = a_listened_server();
        let client = open(&server, "claude-code");
        client.take_plan("auth-refactor");
        while notices.try_recv().is_ok() {}

        // A killed process: the poll is sent, then the socket simply closes.
        let mut socket = TcpStream::connect((Ipv4Addr::LOCALHOST, server.port)).unwrap();
        write!(
            socket,
            "GET /sessions/{}/events HTTP/1.1\r\nHost: localhost\r\n\r\n",
            client.id()
        )
        .unwrap();
        drop(socket);

        assert_eq!(
            notices.recv_timeout(Duration::from_secs(5)),
            Ok(Notice::SessionsChanged)
        );
        assert!(server.sessions().is_empty(), "{:?}", server.sessions());

        server.shutdown();
    }

    #[test]
    fn a_poll_that_answers_keeps_the_session_for_the_next_poll() {
        let (server, notices) = a_listened_server();
        let client = open(&server, "claude-code");
        client.take_plan("auth-refactor");
        while notices.try_recv().is_ok() {}

        server.send("auth-refactor", build("auth-refactor"));
        assert_eq!(client.events().unwrap().events, vec![build("auth-refactor")]);

        // The client asks again at once, as its loop does.
        let polling = client.clone();
        let reader = std::thread::spawn(move || polling.events());
        assert_eq!(server.send("auth-refactor", build("auth-refactor")), 1);
        assert_eq!(reader.join().unwrap().unwrap().events, vec![build("auth-refactor")]);

        assert_eq!(server.sessions().len(), 1);
        assert!(notices.try_recv().is_err(), "the session count never changed");

        server.shutdown();
    }

    #[test]
    fn an_event_for_a_plan_nobody_is_on_waits_for_the_next_session_to_take_it() {
        let server = Server::start(|_| {}).unwrap();
        let elsewhere = open(&server, "cursor");
        elsewhere.take_plan("auth-refactor");

        assert_eq!(server.send("sync", build("sync")), 0);
        assert_eq!(pending_at(server.port, "cursor", Some(elsewhere.id())), Vec::<Event>::new());

        let later = open(&server, "claude-code");
        later.take_plan("sync");
        assert_eq!(later.events().unwrap().events, vec![build("sync")]);
        assert_eq!(pending_at(server.port, "claude-code", Some(later.id())), vec![build("sync")]);

        // The first session to take the plan got it, so a second gets nothing.
        let second = open(&server, "claude-code");
        second.take_plan("sync");
        assert_eq!(pending_at(server.port, "claude-code", Some(second.id())), Vec::<Event>::new());

        server.shutdown();
    }

    #[test]
    fn a_status_change_nobody_heard_is_not_kept_for_later() {
        let server = Server::start(|_| {}).unwrap();
        let status = Event::Status {
            plan: "sync".to_string(),
            status: "in-review".to_string(),
        };
        assert_eq!(server.send("sync", status), 0);

        let later = open(&server, "claude-code");
        later.take_plan("sync");
        assert_eq!(pending_at(server.port, "claude-code", Some(later.id())), Vec::<Event>::new());

        server.shutdown();
    }

    #[test]
    fn a_poll_says_whether_the_app_wants_the_session_woken() {
        let server = Server::start(|_| {}).unwrap();
        let client = open(&server, "claude-code");
        client.take_plan("auth-refactor");

        server.send("auth-refactor", build("auth-refactor"));
        assert!(client.events().unwrap().wake, "on until the person turns it off");

        server.set_wake(false);
        server.send("auth-refactor", build("auth-refactor"));
        assert!(!client.events().unwrap().wake);

        server.shutdown();
    }

    #[test]
    fn a_session_reports_whether_it_woke_its_agent() {
        let (server, notices) = a_listened_server();
        let client = open(&server, "claude-code");
        client.take_plan("auth-refactor");
        while notices.try_recv().is_ok() {}

        client.woke(true);
        assert_eq!(
            notices.recv_timeout(Duration::from_secs(5)),
            Ok(Notice::Woke {
                ok: true,
                plans: vec!["auth-refactor".to_string()],
            })
        );
        client.woke(false);
        assert_eq!(
            notices.recv_timeout(Duration::from_secs(5)),
            Ok(Notice::Woke {
                ok: false,
                plans: vec!["auth-refactor".to_string()],
            })
        );

        server.shutdown();
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

        let json = serde_json::to_string(&build("auth-refactor")).unwrap();
        assert_eq!(json, "{\"kind\":\"build\",\"plan\":\"auth-refactor\",\"threads\":[]}");
        assert_eq!(serde_json::from_str::<Event>(&json).unwrap(), build("auth-refactor"));

        let answers = Event::Answers {
            plan: "auth-refactor".to_string(),
        };
        let json = serde_json::to_string(&answers).unwrap();
        assert_eq!(json, "{\"kind\":\"answers\",\"plan\":\"auth-refactor\"}");
        assert_eq!(serde_json::from_str::<Event>(&json).unwrap(), answers);
    }
}
