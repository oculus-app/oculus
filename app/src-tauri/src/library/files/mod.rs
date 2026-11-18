//! Course files for the frontend: reads, and the student's own uploads and
//! notes.

pub mod commands;
pub mod documents;
#[cfg(test)]
mod tests;
pub mod uploads;
pub mod whiteboards;

pub use uploads::ImportedFile;
