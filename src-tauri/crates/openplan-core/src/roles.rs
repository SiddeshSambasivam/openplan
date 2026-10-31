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

/// The areas every plan needs an answer on, in the order they are named.
pub const REQUIRED_AREAS: [&str; 3] = ["edge cases", "error handling", "scale"];

/// Every role, in the order the cards show.
pub fn all() -> &'static [PersonRolePanel] {
    static PANELS: OnceLock<Vec<PersonRolePanel>> = OnceLock::new();
    PANELS.get_or_init(|| {
        serde_json::from_str(include_str!("person_roles.json")).expect("person_roles.json parses")
    })
}

pub fn panel_of(role: PersonRole) -> &'static PersonRolePanel {
    all().iter().find(|entry| entry.id == role).expect("every role has a panel")
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
    fn a_role_is_stored_by_its_id_and_one_this_build_does_not_know_reads_as_something_else() {
        assert_eq!(serde_json::to_value(PersonRole::Lead).unwrap(), "lead");
        assert_eq!(serde_json::from_value::<PersonRole>("designer".into()).unwrap(), PersonRole::Designer);
        assert_eq!(serde_json::from_value::<PersonRole>("astronaut".into()).unwrap(), PersonRole::Other);
    }
}
