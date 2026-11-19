//! `STUDIO_RENDER_BUILD` for `studio::render::key`, and `CARGO_MANIFEST_DIR`
//! pointed at `app/src-tauri`, where this crate's sources live, so the
//! `env!("CARGO_MANIFEST_DIR")` paths they join (`binaries/`, `fixtures/`,
//! `../studio-core`) resolve as they do from the app crate.

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

fn main() {
    let src_tauri = src_tauri();
    println!("cargo:rustc-env=CARGO_MANIFEST_DIR={}", src_tauri.display());
    studio_render_build(&src_tauri);
}

/// Two levels above this manifest: `crates/oculus-core/` → `app/src-tauri/`.
fn src_tauri() -> PathBuf {
    let manifest = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("cargo sets it"));
    manifest
        .parent()
        .and_then(Path::parent)
        .expect("crates/<name>/ sits two levels under app/src-tauri")
        .to_path_buf()
}

/// `STUDIO_RENDER_BUILD`: sha256 hex of everything a segment's pixels can
/// depend on beyond the project: studio-core's `src/`, its bundled `fonts/`
/// and `themes/`, the images a `starter:` src names (`library/assets/`,
/// compiled in), the KaTeX port `<Math>` typesets with (a path dependency,
/// so no version in the lock moves when it changes), `src/studio/render/`,
/// and `Cargo.lock`, which pins the versions of vello_cpu, parley, taffy and
/// the rest. Each root's path relative to `app/src-tauri`, then its files'
/// sorted relative paths and bytes, all length-prefixed. A segment's key
/// carries it, so a change to any of them never reuses a segment the old
/// build made, and the app and the CLI built from one tree share segments.
fn studio_render_build(src_tauri: &Path) {
    let roots = [
        "../studio-core/src",
        "../studio-core/fonts",
        "../studio-core/themes",
        "../studio-core/library/assets",
        "../math-core/katex/src",
        "../math-core/katex/data",
        "../math-core/katex/build.rs",
        "src/studio/render",
        "Cargo.lock",
    ];
    let mut hash = Sha256::new();
    let mut part = |bytes: &[u8]| {
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    };
    for root in roots {
        let path = src_tauri.join(root);
        println!("cargo:rerun-if-changed={}", path.display());
        part(root.as_bytes());
        let mut files = Vec::new();
        if path.is_file() {
            files.push(path.clone());
        } else {
            walk(&path, &mut files);
        }
        files.sort();
        for file in files {
            let bytes = std::fs::read(&file).expect("read a studio render input");
            let rel = file.strip_prefix(&path).unwrap_or(&file).to_string_lossy();
            part(rel.as_bytes());
            part(&bytes);
        }
    }
    println!("cargo:rustc-env=STUDIO_RENDER_BUILD={:x}", hash.finalize());
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, out);
        } else if entry.file_name() != ".DS_Store" {
            out.push(path);
        }
    }
}
