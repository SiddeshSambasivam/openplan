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
    let ctx = Context {
        base: &base,
        author: Author::user(),
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
    let days = secs / 86_400;
    let time = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        time / 3600,
        (time % 3600) / 60,
        time % 60
    )
}

/// Howard Hinnant's days-from-civil, inverted; exact for every date we can see.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
