//! Who the person is, and which four reviewers ask them questions. The
//! panels are one JSON file the app imports too, so the two never disagree.

use crate::work::Role;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// What the person does, picked in onboarding. A role from a newer build
/// reads as `Other`, whose panel asks in plain words.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PersonRole {
    Engineer,
    Designer,
    Product,
    Lead,
    Founder,
    #[serde(other)]
    Other,
}

/// How a reviewer talks to this person: in the field's own terms, or
/// without jargon.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Voice {
    Deep,
    Plain,
}

#[derive(Debug, Deserialize)]
pub struct PanelMember {
    pub role: Role,
    pub voice: Voice,
}

/// One card on the role picker and the panel it brings.
#[derive(Debug, Deserialize)]
pub struct PersonRolePanel {
    pub id: PersonRole,
    pub label: String,
    pub hint: String,
    /// Completes "The person is ...".
    pub who: String,
    pub panel: Vec<PanelMember>,
    /// The panel member who asks about each required area.
    pub owners: BTreeMap<String, Role>,
}

/// The reviewer behind a question role.
#[derive(Debug, Deserialize)]
pub struct Persona {
    pub name: String,
    pub title: String,
    /// What they ask about, as a sentence fragment.
    pub focus: String,
}

/// The areas every plan needs an answer on, in the order they are named.
pub const REQUIRED_AREAS: [&str; 3] = ["edge cases", "error handling", "scale"];

/// Every role, in the order the cards show.
pub fn all() -> &'static [PersonRolePanel] {
    &table().roles
}

pub fn panel_of(role: PersonRole) -> &'static PersonRolePanel {
    all().iter().find(|entry| entry.id == role).expect("every role has a panel")
}

/// None for a role from a newer build.
pub fn persona(role: &Role) -> Option<&'static Persona> {
    table().personas.get(role.as_str())
}

/// What `get_standards` adds for a person who picked a role: who sits on
/// their panel, how each one talks, and who owns each required area.
pub fn who_is_answering(role: PersonRole) -> String {
    let entry = panel_of(role);
    let mut section = format!(
        "**Who is answering.** The person is {}. Ask only from this panel:\n",
        entry.who
    );
    for member in &entry.panel {
        section.push_str(&member_line(entry, member));
    }
    section.push_str(
        "\nIn depth means the field's own terms, and a request for the person's reasoning \
         on the hardest question. Plain words means no jargon, at most two questions a round, \
         and a recommended option the person can accept without knowing the field.\n",
    );
    section
}

#[derive(Deserialize)]
struct Table {
    personas: BTreeMap<String, Persona>,
    roles: Vec<PersonRolePanel>,
}

fn table() -> &'static Table {
    static TABLE: OnceLock<Table> = OnceLock::new();
    TABLE.get_or_init(|| {
        serde_json::from_str(include_str!("person_roles.json")).expect("person_roles.json parses")
    })
}

/// "- Ada (`accessibility`), in depth, owns edge cases: keyboard, ..."
fn member_line(entry: &PersonRolePanel, member: &PanelMember) -> String {
    let persona = persona(&member.role).expect("every panel member has a persona");
    let voice = match member.voice {
        Voice::Deep => "in depth",
        Voice::Plain => "in plain words",
    };
    let owned: Vec<&str> = REQUIRED_AREAS
        .into_iter()
        .filter(|area| entry.owners.get(*area) == Some(&member.role))
        .collect();
    let owns = if owned.is_empty() { String::new() } else { format!(", owns {}", spoken(&owned)) };
    format!(
        "- {} (`{}`), {voice}{owns}: {}.\n",
        persona.name,
        member.role.as_str(),
        lowercase_first(&persona.focus)
    )
}

/// "a", "a and b", "a, b and c".
fn spoken(items: &[&str]) -> String {
    match items {
        [] => String::new(),
        [one] => one.to_string(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

fn lowercase_first(text: &str) -> String {
    let mut chars = text.chars();
    chars.next().map(|first| first.to_lowercase().chain(chars).collect()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn there_are_six_roles_in_the_order_the_cards_show() {
        let ids: Vec<_> = all().iter().map(|entry| entry.id).collect();

        assert_eq!(
            ids,
            [
                PersonRole::Engineer,
                PersonRole::Designer,
                PersonRole::Product,
                PersonRole::Lead,
                PersonRole::Founder,
                PersonRole::Other
            ]
        );
        for entry in all() {
            assert!(!entry.label.is_empty() && !entry.hint.is_empty() && !entry.who.is_empty());
            assert_eq!(panel_of(entry.id).id, entry.id);
        }
    }

    #[test]
    fn every_panel_has_four_different_reviewers_this_build_knows() {
        for entry in all() {
            let roles: Vec<&Role> = entry.panel.iter().map(|member| &member.role).collect();

            assert_eq!(roles.len(), 4, "{:?}", entry.id);
            for (at, role) in roles.iter().enumerate() {
                assert!(Role::KNOWN.contains(role), "{:?} has {role:?}", entry.id);
                assert!(!roles[..at].contains(role), "{:?} has {role:?} twice", entry.id);
            }
        }
    }

    #[test]
    fn every_required_area_has_an_owner_on_the_panel() {
        for entry in all() {
            assert_eq!(entry.owners.len(), REQUIRED_AREAS.len(), "{:?}", entry.id);
            for area in REQUIRED_AREAS {
                let owner = entry.owners.get(area).unwrap_or_else(|| panic!("{:?} has no {area} owner", entry.id));
                assert!(
                    entry.panel.iter().any(|member| &member.role == owner),
                    "{:?}: {area} belongs to {owner:?}, who is not on the panel",
                    entry.id
                );
            }
        }
    }

    #[test]
    fn the_designer_panel_goes_deep_on_its_own_field() {
        let designer = panel_of(PersonRole::Designer);
        let voices: Vec<(&str, Voice)> =
            designer.panel.iter().map(|member| (member.role.as_str(), member.voice)).collect();

        assert_eq!(
            voices,
            [
                ("design", Voice::Deep),
                ("research", Voice::Deep),
                ("accessibility", Voice::Deep),
                ("engineering", Voice::Plain)
            ]
        );
        assert_eq!(designer.owners["edge cases"], Role::Accessibility);
    }

    #[test]
    fn every_question_role_has_a_persona() {
        for role in Role::KNOWN {
            let persona = persona(&role).unwrap_or_else(|| panic!("no persona for {role:?}"));
            assert!(!persona.name.is_empty() && !persona.title.is_empty() && !persona.focus.is_empty());
        }
        assert_eq!(persona(&Role::Research).unwrap().name, "Noor");
        assert!(persona(&Role::Other("legal".to_string())).is_none());
    }

    #[test]
    fn a_designer_is_told_who_is_answering_in_the_words_the_plan_gave() {
        assert_eq!(
            who_is_answering(PersonRole::Designer),
            "**Who is answering.** The person is a designer. Ask only from this panel:\n\
             - Iris (`design`), in depth: what people see and do.\n\
             - Noor (`research`), in depth: what we know about the people using it.\n\
             - Ada (`accessibility`), in depth, owns edge cases: keyboard, screen readers and contrast.\n\
             - Theo (`engineering`), in plain words, owns error handling and scale: how it is built and tested.\n\
             \n\
             In depth means the field's own terms, and a request for the person's reasoning on the hardest question. \
             Plain words means no jargon, at most two questions a round, and a recommended option the person can accept without knowing the field.\n"
        );
    }

    #[test]
    fn every_role_names_its_panel_and_who_owns_each_required_area() {
        for entry in all() {
            let section = who_is_answering(entry.id);
            let bullets: Vec<&str> = section.lines().filter(|line| line.starts_with("- ")).collect();

            assert!(section.contains(&format!("The person is {}.", entry.who)), "{section}");
            assert_eq!(bullets.len(), 4, "{section}");
            for (member, bullet) in entry.panel.iter().zip(&bullets) {
                let persona = persona(&member.role).unwrap();
                let voice = if member.voice == Voice::Deep { "in depth" } else { "in plain words" };
                assert!(bullet.starts_with(&format!("- {} (`{}`), {voice}", persona.name, member.role.as_str())), "{bullet}");
            }
            for area in REQUIRED_AREAS {
                assert_eq!(bullets.iter().filter(|bullet| bullet.contains(area)).count(), 1, "{area}: {section}");
            }
            assert_eq!(crate::standards::writing_faults(&section), Vec::<String>::new());
        }
        assert!(who_is_answering(PersonRole::Founder).contains("owns edge cases, error handling and scale"));
        assert!(who_is_answering(PersonRole::Other).contains("The person is in another field."));
    }

    #[test]
    fn a_role_is_stored_by_its_id_and_one_this_build_does_not_know_reads_as_something_else() {
        assert_eq!(serde_json::to_value(PersonRole::Lead).unwrap(), "lead");
        assert_eq!(serde_json::from_value::<PersonRole>("designer".into()).unwrap(), PersonRole::Designer);
        assert_eq!(serde_json::from_value::<PersonRole>("astronaut".into()).unwrap(), PersonRole::Other);
    }
}
