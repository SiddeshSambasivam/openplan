//! This session's tie to the app. The app comes and goes while a session
//! lives, so the tie is made again whenever the app is back.

use notify::{EventKind, RecursiveMode, Watcher};
use openplan_core::local::{self, Event};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// What the app has sent this session, waiting for somewhere to put it.
pub(crate) type Inbox = Arc<Mutex<Vec<Event>>>;

pub(crate) struct Link {
    app: PathBuf,
    client_name: String,
    inbox: Inbox,
    joined: Mutex<Joined>,
}

#[derive(Default)]
struct Joined {
    client: Option<local::Client>,
    /// Every plan this session worked on, so the next app hears them too.
    plans: Vec<String>,
}

impl Link {
    /// `app` is the file in which the app says which port it listens on.
    pub(crate) fn new(app: PathBuf, client_name: &str, inbox: Inbox) -> Arc<Link> {
        Arc::new(Link {
            app,
            client_name: client_name.to_string(),
            inbox,
            joined: Mutex::default(),
        })
    }

    /// Registers with the app if one is open and this session is not on it
    /// yet, and keeps a request held there so anything it sends arrives
    /// without being asked for. Silence is the ordinary answer: with no app,
    /// every tool works exactly as it does on its own.
    pub(crate) fn ensure(self: &Arc<Self>) {
        // Held through the handshake, so two callers never register twice.
        let Ok(mut joined) = self.joined.lock() else {
            return;
        };
        if joined.client.is_some() {
            return;
        }
        let Some(client) = local::connect(&self.app, &self.client_name) else {
            return;
        };
        for plan_id in &joined.plans {
            client.take_plan(plan_id);
        }
        joined.client = Some(client.clone());
        drop(joined);
        self.listen(client);
    }

    /// Puts this session on the plan, now if the app is open and again each
    /// time an app opens.
    pub(crate) fn take_plan(&self, plan_id: &str) {
        let Ok(mut joined) = self.joined.lock() else {
            return;
        };
        if !joined.plans.iter().any(|p| p == plan_id) {
            joined.plans.push(plan_id.to_string());
        }
        if let Some(client) = &joined.client {
            client.take_plan(plan_id);
        }
    }

    /// The app this session is on right now, if any.
    pub(crate) fn client(&self) -> Option<local::Client> {
        self.joined.lock().ok()?.client.clone()
    }

    /// Joins each app that starts while this session lives. The app writes
    /// its file on start, so the file changing is the cue. Without a watch,
    /// the next tool call joins instead.
    pub(crate) fn watch(self: &Arc<Self>) {
        let (Some(dir), Some(file)) = (self.app.parent(), self.app.file_name()) else {
            return;
        };
        let file = file.to_owned();
        let (sender, events) = std::sync::mpsc::channel();
        let Ok(mut watcher) = notify::recommended_watcher(sender) else {
            return;
        };
        if watcher.watch(dir, RecursiveMode::NonRecursive).is_err() {
            return;
        }
        let link = self.clone();
        std::thread::spawn(move || {
            // The watch lasts as long as this thread owns it.
            let _watcher = watcher;
            for event in events.into_iter().flatten() {
                // Joining reads the file, which must not count as a change.
                let about_the_file = event.paths.iter().any(|p| p.file_name() == Some(&*file));
                if about_the_file && !matches!(event.kind, EventKind::Access(_)) {
                    link.ensure();
                }
            }
        });
    }

    /// Moves what the app sends into the inbox until the app lets this
    /// session go, then leaves the link free for the next app.
    fn listen(self: &Arc<Self>, client: local::Client) {
        let link = self.clone();
        std::thread::spawn(move || {
            // Each read blocks in the app until there is something to say; an
            // empty answer is how the end of the session arrives.
            while let Some(polled) = client.events() {
                if polled.events.is_empty() {
                    break;
                }
                let wake = polled
                    .wake
                    .then(|| crate::wake_text(&polled.events))
                    .flatten();
                let Ok(mut waiting) = link.inbox.lock() else {
                    break;
                };
                waiting.extend(polled.events);
                // Queued first, so the turn the wake starts finds the events.
                drop(waiting);
                if let Some(text) = wake {
                    wake_agent(&client, text);
                }
            }
            link.forget(&client);
        });
    }

    /// Only the app that ended is forgotten. A newer one may already be here.
    fn forget(&self, client: &local::Client) {
        if let Ok(mut joined) = self.joined.lock() {
            if joined.client.as_ref() == Some(client) {
                joined.client = None;
            }
        }
    }
}

/// Starts the agent's turn and tells the app whether it did, on a thread of
/// its own so the poll never waits on the inbox. A session with no inbox
/// tells the app nothing, and its hooks deliver as they always have.
#[cfg(unix)]
fn wake_agent(client: &local::Client, text: String) {
    let Some(inbox) = crate::wake::Inbox::from_env() else {
        return;
    };
    let client = client.clone();
    std::thread::spawn(move || client.woke(inbox.wake(&text).is_ok()));
}

#[cfg(not(unix))]
fn wake_agent(_client: &local::Client, _text: String) {}

#[cfg(test)]
mod tests {
    use super::*;
    use openplan_core::local::{AppInfo, Server};
    use std::path::Path;
    use std::time::{Duration, Instant};

    fn temp_dir(name: &str) -> PathBuf {
        // Named per process: every checkout on this machine shares one
        // temp directory, and a fixed name lets one run wipe another's.
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// What the app does on start: listen, then say where.
    fn an_app(app: &Path) -> Server {
        let server = Server::start(|_| {}).unwrap();
        local::write_app(
            app,
            &AppInfo {
                port: server.port,
                pid: std::process::id(),
            },
        )
        .unwrap();
        server
    }

    fn plans_on(server: &Server) -> Vec<Vec<String>> {
        server.sessions().into_iter().map(|s| s.plans).collect()
    }

    fn within_seconds(seconds: u64, done: impl Fn() -> bool) -> bool {
        let deadline = Instant::now() + Duration::from_secs(seconds);
        while Instant::now() < deadline {
            if done() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        done()
    }

    #[test]
    fn a_session_reconnects_to_the_next_app_and_takes_its_plans_again() {
        let dir = temp_dir("openplan-cli-link-reconnect");
        let app = dir.join("app.json");
        let first = an_app(&app);
        let link = Link::new(app.clone(), "claude-code", Inbox::default());

        link.ensure();
        link.take_plan("auth-refactor");
        assert_eq!(plans_on(&first), vec![vec!["auth-refactor".to_string()]]);

        // The app quits and leaves its file behind, as a crash does.
        first.shutdown();
        drop(first);
        assert!(
            within_seconds(5, || link.client().is_none()),
            "the poll sees the app go"
        );
        link.ensure();
        assert!(link.client().is_none(), "nothing answers the old port");

        let second = an_app(&app);
        link.ensure();
        assert_eq!(plans_on(&second), vec![vec!["auth-refactor".to_string()]]);

        second.shutdown();
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Waits on the file system's own notices, which arrive after a short
    /// delay on macOS, so it allows a few seconds.
    #[test]
    fn the_watcher_reconnects_without_a_tool_call() {
        let dir = temp_dir("openplan-cli-link-watch");
        let app = dir.join("app.json");
        let first = an_app(&app);
        let link = Link::new(app.clone(), "claude-code", Inbox::default());
        link.watch();
        link.ensure();
        link.take_plan("auth-refactor");

        // The app removes its file and stops, as it does on quit.
        local::remove_app(&app);
        first.shutdown();
        drop(first);
        assert!(
            within_seconds(5, || link.client().is_none()),
            "the poll sees the app go"
        );

        let second = an_app(&app);
        assert!(
            within_seconds(5, || plans_on(&second)
                == vec![vec!["auth-refactor".to_string()]]),
            "{:?}",
            second.sessions()
        );

        second.shutdown();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
