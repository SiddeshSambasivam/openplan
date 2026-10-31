//! The house style agents write plans to. It belongs to the app, not to the
//! plan base: a base is plans and their history, and shipping the standards
//! inside one would make every base carry its own drifting copy of a document
//! nobody edited.
//!
//! What the user can change is layered on top rather than replacing it, so a
//! new build's improvements still reach someone who added a rule of their own.

/// Ships with the app. Read by agents before they file a plan.
pub const BUILT_IN: &str = include_str!("standards.md");

/// What the body has to be in the mode this machine is set to, and whether
/// media is on. Both come first, because they decide how everything below
/// them is written, and the Media section reads its rule off the second line.
pub fn authoring_block(mode: &str, media: bool) -> String {
    let body = if mode == "html" {
        "Write the body as one self-contained HTML document: no scripts, no external \
         resources, headings that say what they are, and the same required sections."
    } else {
        "Write the body as markdown. Keep it compact. The app renders it."
    };
    let media = if media { "on" } else { "off" };
    format!("Authoring mode: {mode}\nMedia: {media}\n\n{body}\n\n")
}

/// What agents are told: the mode, the media line, the built-in standards,
/// plus whatever the user added.
pub fn effective_with_media(mode: &str, media: bool, overrides: Option<&str>) -> String {
    let mut served = authoring_block(mode, media);
    served.push_str(BUILT_IN);
    if let Some(extra) = overrides.map(str::trim).filter(|s| !s.is_empty()) {
        served.push_str(&format!("\n## Also, for this person\n\n{extra}\n"));
    }
    served
}

/// The sections a plan of this type has to carry, in the order the standards
/// list them. A type this build does not know asks for nothing, so a base is
/// never nagged about a word someone invented.
pub fn required_sections(plan_type: &str) -> &'static [&'static str] {
    match plan_type.trim().to_lowercase().as_str() {
        "feature" => &[
            "Summary",
            "Current state",
            "Approach",
            "Steps",
            "Risks and open questions",
        ],
        "bug" => &["Summary", "Reproduction", "Root cause", "Blast radius", "Steps"],
        "migration" => &["Summary", "Current state", "Approach", "Steps", "Rollback"],
        "research" => &[
            "Question",
            "What we know",
            "Options",
            "Recommendation",
            "Open questions",
        ],
        "audit" => &["Scope", "Findings", "Recommendations"],
        _ => &[],
    }
}

/// The text of every heading in a plan, markdown or HTML, lowercased.
fn headings(body: &str) -> Vec<String> {
    let mut found = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim_start();
        let hashes = trimmed.chars().take_while(|c| *c == '#').count();
        if hashes > 0 {
            let text = trimmed[hashes..].trim();
            if !text.is_empty() {
                found.push(text.to_lowercase());
            }
        }
    }
    let lower = body.to_lowercase();
    for level in ['1', '2', '3'] {
        let open = format!("<h{level}");
        let close = format!("</h{level}>");
        let mut from = 0;
        while let Some(start) = lower[from..].find(&open) {
            let after_tag = match lower[from + start..].find('>') {
                Some(offset) => from + start + offset + 1,
                None => break,
            };
            let end = match lower[after_tag..].find(&close) {
                Some(offset) => after_tag + offset,
                None => break,
            };
            found.push(lower[after_tag..end].trim().to_string());
            from = end + close.len();
        }
    }
    found
}

/// Which required sections the body does not have. A warning, never a
/// refusal: a plan that is short a section is still worth filing.
pub fn missing_sections(plan_type: &str, body: &str) -> Vec<&'static str> {
    let headings = headings(body);
    required_sections(plan_type)
        .iter()
        .filter(|section| {
            let wanted = section.to_lowercase();
            !headings.iter().any(|heading| heading.contains(&wanted))
        })
        .copied()
        .collect()
}

/// Opens the Writing bullet that lists the banned words. The lint reads its
/// list from there and skips the bullet itself.
#[cfg(test)]
const BANNED_LIST: &str = "- Never write:";

/// Every place a text breaks the Writing rules a machine can check, one line
/// each. Kept beside the standards so any later edit to them, or to the block
/// the installers write, has to pass it.
#[cfg(test)]
pub(crate) fn writing_faults(text: &str) -> Vec<String> {
    let banned = banned_words();
    let mut faults = Vec::new();
    let mut in_banned_list = false;
    for (index, line) in text.lines().enumerate() {
        in_banned_list = line.starts_with(BANNED_LIST) || (in_banned_list && line.starts_with("  "));
        if in_banned_list {
            continue;
        }
        let number = index + 1;
        if line.contains('\u{2014}') {
            faults.push(format!("line {number}: em dash"));
        }
        if joins_clauses_with_a_semicolon(line) {
            faults.push(format!("line {number}: semicolon between clauses"));
        }
        let lower = line.to_lowercase();
        for word in lower.split(|c: char| !c.is_alphabetic()) {
            if banned.iter().any(|banned_word| banned_word == word) {
                faults.push(format!("line {number}: {word}"));
            }
        }
    }
    faults
}

/// The words the Writing section bans, with any "(as ...)" note dropped.
#[cfg(test)]
fn banned_words() -> Vec<String> {
    let lines: Vec<&str> = BUILT_IN.lines().collect();
    let start = lines
        .iter()
        .position(|line| line.starts_with(BANNED_LIST))
        .expect("the Writing section lists the banned words");
    let continued = lines[start + 1..].iter().take_while(|line| line.starts_with("  ")).count();
    let bullet = lines[start..=start + continued].join(" ");
    let list = bullet[BANNED_LIST.len()..].split('.').next().unwrap_or_default();
    list.split(',')
        .map(|entry| entry.split('(').next().unwrap_or_default().trim().to_lowercase())
        .filter(|word| !word.is_empty())
        .collect()
}

/// Approximate: a semicolon followed by a lowercase word joins two clauses.
#[cfg(test)]
fn joins_clauses_with_a_semicolon(line: &str) -> bool {
    line.match_indices("; ")
        .any(|(at, _)| line[at + 2..].chars().next().is_some_and(char::is_lowercase))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_type_asks_for_the_sections_the_standards_list() {
        assert_eq!(
            required_sections("feature"),
            ["Summary", "Current state", "Approach", "Steps", "Risks and open questions"]
        );
        assert_eq!(
            required_sections("bug"),
            ["Summary", "Reproduction", "Root cause", "Blast radius", "Steps"]
        );
        assert_eq!(
            required_sections("migration"),
            ["Summary", "Current state", "Approach", "Steps", "Rollback"]
        );
        assert_eq!(
            required_sections("research"),
            ["Question", "What we know", "Options", "Recommendation", "Open questions"]
        );
        assert_eq!(required_sections("audit"), ["Scope", "Findings", "Recommendations"]);
    }

    #[test]
    fn the_standards_document_lists_the_same_sections_the_code_checks_for() {
        for plan_type in ["feature", "bug", "migration", "research", "audit"] {
            let row = BUILT_IN
                .lines()
                .find(|line| line.starts_with(&format!("| `{plan_type}` |")))
                .unwrap_or_else(|| panic!("no row for {plan_type}"));
            for section in required_sections(plan_type) {
                assert!(row.contains(section), "{plan_type} row is missing {section}");
            }
        }
    }

    #[test]
    fn a_type_this_build_does_not_know_asks_for_nothing() {
        assert!(required_sections("spike").is_empty());
        assert!(missing_sections("spike", "# Anything\n").is_empty());
    }

    #[test]
    fn a_heading_of_any_level_counts_as_the_section() {
        let body = "# Auth refactor\n\n## Summary\n\n### current STATE\n\n#### Approach\n\n\
                    ##### Steps\n\n###### Risks and open questions\n";

        assert!(missing_sections("feature", body).is_empty(), "{:?}", missing_sections("feature", body));
    }

    #[test]
    fn an_html_heading_counts_too() {
        let body = "<h1>Auth refactor</h1><h2>Summary</h2>\n<h3 class=\"x\">Current state</h3>\n\
                    <h2>Approach</h2><h2>Steps</h2><h2>Risks and open questions</h2>\n";

        assert!(missing_sections("feature", body).is_empty(), "{:?}", missing_sections("feature", body));
    }

    #[test]
    fn what_a_plan_left_out_is_named_in_the_order_the_standards_list_it() {
        let body = "# A bug\n\n## Summary\n\n## Steps\n";

        assert_eq!(
            missing_sections("bug", body),
            ["Reproduction", "Root cause", "Blast radius"]
        );
    }

    #[test]
    fn the_words_have_to_be_in_a_heading_not_just_in_the_prose() {
        let body = "# A bug\n\nThe reproduction is in the ticket, and the root cause with it.\n";

        assert!(missing_sections("bug", body).contains(&"Reproduction"));
    }

    #[test]
    fn a_heading_that_says_more_than_the_section_name_still_counts() {
        let body = "# An audit\n\n## Scope of the review\n\n## Findings, ranked\n\n\
                    ## Recommendations for the next quarter\n";

        assert!(missing_sections("audit", body).is_empty());
    }

    #[test]
    fn without_additions_agents_get_what_ships_under_the_mode_they_write_in() {
        let served = effective_with_media("markdown", false, None);

        assert!(served.starts_with("Authoring mode: markdown"), "{served}");
        assert!(served.contains(BUILT_IN));
        assert_eq!(effective_with_media("markdown", false, Some("   ")), served);
    }

    #[test]
    fn html_mode_says_what_the_body_has_to_be() {
        let served = effective_with_media("html", false, None);

        assert!(served.starts_with("Authoring mode: html"), "{served}");
        let opening = served.split("# Plan standards").next().unwrap();
        assert!(opening.contains("self-contained"), "{opening}");
        assert!(opening.contains("no scripts"), "{opening}");
        assert!(opening.contains("same required sections"), "{opening}");
    }

    #[test]
    fn the_second_line_says_whether_media_is_on() {
        let second_line = |served: String| served.lines().nth(1).unwrap_or_default().to_string();

        assert_eq!(second_line(effective_with_media("markdown", true, None)), "Media: on");
        assert_eq!(second_line(effective_with_media("html", false, None)), "Media: off");
    }

    #[test]
    fn the_standards_say_how_a_plan_moves_and_what_to_ask_at_alignment() {
        for heading in ["## Lifecycle", "## Alignment", "## Question bank", "## Todos", "## Pull requests", "## Media"] {
            assert!(BUILT_IN.lines().any(|line| line == heading), "no {heading}");
        }
        for plan_type in ["feature", "bug", "migration", "research", "audit"] {
            let heading = format!("### `{plan_type}`");
            assert!(BUILT_IN.lines().any(|line| line == heading), "no question bank for {plan_type}");
        }
    }

    /// The lines under a top-level heading, up to the next one.
    fn section(heading: &str) -> Vec<&'static str> {
        BUILT_IN
            .lines()
            .skip_while(|line| *line != heading)
            .skip(1)
            .take_while(|line| !line.starts_with("## "))
            .collect()
    }

    #[test]
    fn alignment_questions_carry_their_context_and_each_options_tradeoff() {
        let alignment = section("## Alignment").join("\n");

        for rule in [
            "at most 12 questions",
            "Accept all N recommendations",
            "`context`",
            "`consequence`",
            "`tradeoff`",
            "first line",
            "description",
        ] {
            assert!(alignment.contains(rule), "the Alignment section is missing {rule}");
        }
        assert_eq!(writing_faults(&alignment), Vec::<String>::new());
    }

    #[test]
    fn the_question_bank_stays_short_enough_to_read_in_one_go() {
        let bank = section("## Question bank");

        assert!(!bank.is_empty());
        assert!(bank.len() < 90, "the question bank is {} lines", bank.len());
    }

    #[test]
    fn a_plan_opens_with_its_title_and_carries_no_header_line() {
        assert!(BUILT_IN.contains("reads as a change, not a topic"));
        assert!(!BUILT_IN.lines().any(|line| line == "## The header"));
        for field in ["**Status:**", "**Found:**", "**Affects:**", "`Owner:`", "`Branch:`"] {
            assert!(!BUILT_IN.contains(field), "the standards still ask for {field}");
        }
    }

    #[test]
    fn the_media_section_is_a_remotion_recipe_short_enough_to_follow() {
        let media = section("## Media");
        let text = media.join("\n");

        assert!(media.len() < 45, "the Media section is {} lines", media.len());
        for step in [
            "npx create-video@latest --blank",
            "npx remotion render",
            "--codec h264 --crf 23",
            "1920x1080",
            "30 fps",
            "300 ms",
            "media/clip.mp4",
            "With \"Media: off\", add neither.",
        ] {
            assert!(text.contains(step), "the Media section is missing {step}");
        }
        assert_eq!(writing_faults(&text), Vec::<String>::new());
    }

    #[test]
    fn the_built_in_standards_follow_their_own_writing_rules() {
        assert_eq!(writing_faults(BUILT_IN), Vec::<String>::new());
    }

    #[test]
    fn the_writing_lint_names_each_fault_by_line() {
        let text = "A plain line.\nOne idea \u{2014} then another.\nIt runs; it also fails.\n\
                    Call `a`; `b` stays. Done; Next.\nWe leverage the cache.\n";

        assert_eq!(
            writing_faults(text),
            ["line 2: em dash", "line 3: semicolon between clauses", "line 5: leverage"]
        );
    }

    #[test]
    fn the_list_of_banned_words_is_read_from_the_writing_section() {
        let words = banned_words();

        assert!(words.contains(&"leverage".to_string()), "{words:?}");
        assert!(words.contains(&"landscape".to_string()), "{words:?}");
        assert!(words.iter().all(|word| !word.contains(' ')), "{words:?}");
    }

    #[test]
    fn additions_are_layered_on_rather_than_replacing() {
        let combined = effective_with_media("markdown", false, Some("Always name the reviewer."));

        assert!(combined.contains(BUILT_IN));
        assert!(combined.contains("Always name the reviewer."));
    }
}
