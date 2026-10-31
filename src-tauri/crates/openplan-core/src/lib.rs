//! The OpenPlan file contract, shared by the desktop app and the CLI so the
//! two can never disagree about what is on disk.

pub mod archive;
pub mod base;
pub mod bulk;
pub mod comments;
pub mod discovery;
pub mod fs;
pub mod import;
pub mod integrations;
pub mod library;
pub mod local;
pub mod plan;
pub mod profile;
pub mod repo;
pub mod roles;
pub mod settings;
pub mod standards;
pub mod sidecar;
pub mod work;
