//! `CARGO_MANIFEST_DIR` pointed at `app/src-tauri`, where this crate's
//! sources live, so the `env!("CARGO_MANIFEST_DIR")` paths they join
//! (`fixtures/`, `../dist/widget-kit`) resolve as they do from the app crate.

use std::path::{Path, PathBuf};

fn main() {
    let manifest = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("cargo sets it"));
    let src_tauri = manifest
        .parent()
        .and_then(Path::parent)
        .expect("crates/<name>/ sits two levels under app/src-tauri");
    println!("cargo:rustc-env=CARGO_MANIFEST_DIR={}", src_tauri.display());
}
