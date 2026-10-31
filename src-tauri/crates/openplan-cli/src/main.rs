use openplan_cli::{run, Context};
use openplan_core::import::now_iso;
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
    // Whatever changed since the last tool ran, before this one writes.
    if let Err(e) = settings::sync_base(&base) {
        eprintln!("{e}");
        std::process::exit(1);
    }
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
