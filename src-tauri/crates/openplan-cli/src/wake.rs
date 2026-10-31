//! Starts the agent's turn in an idle session, by writing one message to the
//! session's own inbox. The harness that spawned this process tells it where
//! the inbox is; a harness that tells it nothing has none.

use serde_json::json;
use std::io::Write;
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

/// The inbox reads on its own thread, so a write that cannot finish in this
/// long never will.
const WRITE_LIMIT: Duration = Duration::from_secs(2);

/// The session's inbox, as the harness handed it down.
#[derive(Debug, Clone)]
pub struct Inbox {
    socket: PathBuf,
    token: String,
}

impl Inbox {
    /// `None` when the harness gives this session no inbox, as Cursor and
    /// older Claude Code do.
    pub fn from_env() -> Option<Inbox> {
        Some(Inbox {
            socket: std::env::var_os("CLAUDE_CODE_MESSAGING_SOCKET")?.into(),
            token: std::env::var("CLAUDE_CODE_MESSAGING_TOKEN").ok()?,
        })
    }

    /// Writes `text` to the inbox as a message for the agent. The inbox
    /// sends no reply, so a finished write is all the proof there is.
    pub fn wake(&self, text: &str) -> Result<(), String> {
        let mut stream = connect(self)?;
        let auth = json!({ "type": "auth", "token": self.token });
        let message = json!({ "type": "user", "message": { "role": "user", "content": text } });
        write_line(&mut stream, &auth)?;
        write_line(&mut stream, &message)
    }
}

/// Opened only once the message is ready, since the inbox drops a
/// connection that stays quiet.
fn connect(inbox: &Inbox) -> Result<UnixStream, String> {
    let stream = UnixStream::connect(&inbox.socket)
        .map_err(|e| format!("Couldn't reach the session's inbox: {e}"))?;
    stream
        .set_write_timeout(Some(WRITE_LIMIT))
        .map_err(|e| format!("Couldn't reach the session's inbox: {e}"))?;
    Ok(stream)
}

fn write_line(stream: &mut UnixStream, value: &serde_json::Value) -> Result<(), String> {
    writeln!(stream, "{value}")
        .and_then(|()| stream.flush())
        .map_err(|e| format!("Couldn't write to the session's inbox: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::os::unix::net::UnixListener;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_wake_authenticates_then_sends_one_message_for_the_agent() {
        let dir = temp_dir("openplan-cli-wake");
        let socket = dir.join("inbox.sock");
        let listener = UnixListener::bind(&socket).unwrap();
        let inbox = Inbox {
            socket,
            token: "secret".to_string(),
        };

        inbox.wake("OpenPlan: Build was pressed on auth.").unwrap();

        let (stream, _) = listener.accept().unwrap();
        let lines: Vec<serde_json::Value> = BufReader::new(stream)
            .lines()
            .map(|line| serde_json::from_str(&line.unwrap()).unwrap())
            .collect();
        assert_eq!(
            lines,
            vec![
                json!({ "type": "auth", "token": "secret" }),
                json!({ "type": "user", "message": { "role": "user", "content": "OpenPlan: Build was pressed on auth." } }),
            ]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_inbox_that_is_gone_is_an_error_not_a_hang() {
        let dir = temp_dir("openplan-cli-wake-gone");
        let inbox = Inbox {
            socket: dir.join("nobody.sock"),
            token: "secret".to_string(),
        };

        let refused = inbox.wake("hello").unwrap_err();

        assert!(refused.contains("inbox"), "{refused}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
