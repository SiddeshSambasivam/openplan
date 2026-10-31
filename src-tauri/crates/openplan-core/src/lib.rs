//! The OpenPlan file contract, shared by the desktop app and the CLI so the
//! two can never disagree about what is on disk.

pub mod base;
pub mod fs;
pub mod library;
pub mod plan;
pub mod repo;
pub mod settings;
pub mod standards;
pub mod sidecar;
