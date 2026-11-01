//! Who the person is, and which four reviewers ask them questions. The
//! panels are one JSON file the app imports too, so the two never disagree.

use crate::work::Role;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// What the person does, picked in onboarding. A role from a newer build
/// reads as `Other`.
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

/// One card on the role picker and the panel it brings.
#[derive(Debug, Deserialize)]
pub struct PersonRolePanel {
    pub id: PersonRole,
    pub label: String,
    pub hint: String,
    /// Completes "The person is ...".
    pub who: String,
    /// The question roles that ask this person, in the order they show.
    pub panel: Vec<Role>,
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
/// their panel, and who owns each required area.
pub fn who_is_answering(role: PersonRole) -> String {
    let entry = panel_of(role);
    let mut section = format!(
        "**Who is answering.** The person is {}. Ask only from this panel:\n",
        entry.who
    );
    for role in &entry.panel {
        section.push_str(&member_line(entry, role));
    }
    section.push_str(
        "\nEvery reviewer asks in the field's own terms. \
         On the hardest question, ask the person to explain their reasoning.\n",
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

/// "- Ada (`accessibility`), owns edge cases: keyboard, ..."
fn member_line(entry: &PersonRolePanel, role: &Role) -> String {
    let persona = persona(role).expect("every panel member has a persona");
    let owned: Vec<&str> =
        REQUIRED_AREAS.into_iter().filter(|area| entry.owners.get(*area) == Some(role)).collect();
    let owns = if owned.is_empty() { String::new() } else { format!(", owns {}", spoken(&owned)) };
    format!(
        "- {} (`{}`){owns}: {}.\n",
        persona.name,
        role.as_str(),
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
            let roles: Vec<&Role> = entry.panel.iter().collect();

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
                    entry.panel.contains(owner),
                    "{:?}: {area} belongs to {owner:?}, who is not on the panel",
                    entry.id
                );
            }
        }
    }

    #[test]
    fn the_designer_panel_is_its_own_field_and_engineering() {
        let designer = panel_of(PersonRole::Designer);
        let roles: Vec<&str> = designer.panel.iter().map(Role::as_str).collect();

        assert_eq!(roles, ["design", "research", "accessibility", "engineering"]);
        assert_eq!(designer.owners["edge cases"], Role::Accessibility);
        assert_eq!(panel_of(PersonRole::Other).panel, [Role::Product, Role::Engineering, Role::Design, Role::Oncall]);
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
             - Iris (`design`): what people see and do.\n\
             - Noor (`research`): what we know about the people using it.\n\
             - Ada (`accessibility`), owns edge cases: keyboard, screen readers and contrast.\n\
             - Theo (`engineering`), owns error handling and scale: how it is built and tested.\n\
             \n\
             Every reviewer asks in the field's own terms. \
             On the hardest question, ask the person to explain their reasoning.\n"
        );
    }

    #[test]
    fn every_role_names_its_panel_and_who_owns_each_required_area() {
        for entry in all() {
            let section = who_is_answering(entry.id);
            let bullets: Vec<&str> = section.lines().filter(|line| line.starts_with("- ")).collect();

            assert!(section.contains(&format!("The person is {}.", entry.who)), "{section}");
            assert_eq!(bullets.len(), 4, "{section}");
            for (role, bullet) in entry.panel.iter().zip(&bullets) {
                let persona = persona(role).unwrap();
                assert!(bullet.starts_with(&format!("- {} (`{}`)", persona.name, role.as_str())), "{bullet}");
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
