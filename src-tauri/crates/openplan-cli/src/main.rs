use openplan_cli::{run, Context};
use openplan_core::repo::Author;
use openplan_core::settings;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let base = match settings::resolve_default_base() {
        Ok(base) => base,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };
    if args.first().map(String::as_str) == Some("mcp") {
        let stdin = std::io::stdin();
        let stdout = std::io::stdout();
        if let Err(e) = openplan_cli::mcp::serve(&base, stdin.lock(), stdout.lock()) {
            eprintln!("{e}");
            std::process::exit(1);
        }
        return;
    }
    let ctx = Context {
        base: &base,
        author: openplan_core::settings::me(),
        now: now_iso(),
    };
    match run(&args, &ctx) {
        Ok(out) => println!("{out}"),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}

/// An ISO 8601 timestamp, without pulling in a date library for one line.
fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    openplan_core::import::iso_from_unix(secs)
}
