//! S1-mini's files: the Q4_K_M GGUF with the licence and notice that must stay
//! beside it, each pinned to one commit of `superwhisper/s1-mini-GGUF` with
//! its size and SHA-256, downloaded on request to `<app data>/models/s1-mini/`
//! (outside `courses/`), never bundled.

use std::path::PathBuf;

use crate::runtime::onnx::{Pack, PackFile};

/// The model's name, which its licence requires exactly as written.
pub const NAME: &str = "S1-mini";
pub const BY: &str = "Superwhisper";

pub const MODEL_FILE: &str = "s1-mini-q4_k_m.gguf";

/// The server's output, rewritten each start; kept for the error that says why
/// a start failed.
pub const LOG_FILE: &str = "llama-server.log";

/// The licence and notice come first, so the model never lands without them.
pub const PACK: Pack = Pack {
    id: "s1-mini",
    files: &[
        PackFile {
            file: "LICENSE",
            url: "https://huggingface.co/superwhisper/s1-mini-GGUF/resolve/34add00a48a2e5d24e5a4ee5405a99620a3a240c/LICENSE",
            bytes: 12_033,
            sha256: "f715982df6ce767ae64864d74b95644e5d658aab54717dbceeb252eb3cbcb421",
        },
        PackFile {
            file: "NOTICE",
            url: "https://huggingface.co/superwhisper/s1-mini-GGUF/resolve/34add00a48a2e5d24e5a4ee5405a99620a3a240c/NOTICE",
            bytes: 507,
            sha256: "6eb1e98a0d0046dd1b71da19d3b64ebccc12622e7d62e5efcad10298b4d66292",
        },
        PackFile {
            file: MODEL_FILE,
            url: "https://huggingface.co/superwhisper/s1-mini-GGUF/resolve/34add00a48a2e5d24e5a4ee5405a99620a3a240c/s1-mini-q4_k_m.gguf",
            bytes: 484_219_808,
            sha256: "3b41ebe2502cbd03e811d5d16b022f5ab551eda58d62597d152f89535003c634",
        },
    ],
};

/// Where the files are kept.
pub fn dir() -> PathBuf {
    crate::library::paths::data_dir()
        .join("models")
        .join("s1-mini")
}
