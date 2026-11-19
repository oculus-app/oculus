use std::fmt;
use std::io::{ErrorKind, Write};
use std::path::Path;

use super::bucket::bucket_dir;
use super::frontmatter::{parse_with_body_suffix, render, render_front, Front};
use super::maintain::{order_meta, refresh_index};
use super::query::list;
use super::slug::{name_from, slug};
use super::{CAP, TYPES};

/// What `oculus memory write` was asked for. Absent fields are kept from the
/// existing file or derived.
#[derive(Default)]
pub struct WriteSpec {
    pub name: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub kind: Option<String>,
    pub body: Option<String>,
    pub replace: bool,
    pub why: Option<String>,
    pub how: Option<String>,
    pub source: Option<String>,
    pub links: Vec<String>,
    pub extra: Vec<(String, String)>,
}

/// Where the memory was written.
#[derive(Debug, serde::Serialize)]
pub struct Written {
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    /// Whether the operation created a new memory.
    pub created: bool,
    /// How many entries the index has now.
    pub indexed: usize,
}

#[derive(Debug, serde::Serialize)]
pub struct WriteResult {
    #[serde(flatten)]
    pub written: Written,
    pub outcome: WriteOutcome,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WriteOutcome {
    Created,
    MetadataUpdated,
    BodyReplaced,
    Unchanged,
}

#[derive(Debug)]
pub enum WriteError {
    BodyReplacementRequired { current_body: String },
    InvalidExistingMemory { path: String },
    Other(String),
}

impl fmt::Display for WriteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BodyReplacementRequired { .. } => f.write_str(
                "This memory already has text. Use `oculus memory append` to add a line or `oculus memory write --replace` to rewrite the whole body.",
            ),
            Self::InvalidExistingMemory { path } => {
                write!(f, "cannot parse existing memory {path}")
            }
            Self::Other(message) => f.write_str(message),
        }
    }
}

impl From<String> for WriteError {
    fn from(message: String) -> Self {
        Self::Other(message)
    }
}

impl From<&str> for WriteError {
    fn from(message: &str) -> Self {
        Self::Other(message.into())
    }
}

/// Write a memory and refresh its index when it changes. Replacing existing
/// text requires `spec.replace`.
pub fn write(
    data_dir: &Path,
    code: Option<&str>,
    spec: WriteSpec,
) -> Result<WriteResult, WriteError> {
    upsert(data_dir, code, spec, true)
}

/// [`write`], with the room check optional for a fold, which only ever shrinks
/// the bucket.
pub(super) fn upsert(
    data_dir: &Path,
    code: Option<&str>,
    spec: WriteSpec,
    check_room: bool,
) -> Result<WriteResult, WriteError> {
    let dir = bucket_dir(data_dir, code);

    let name = match spec.name.as_deref().map(slug).filter(|s| !s.is_empty()) {
        Some(name) => name,
        // A missing name is derived from the one-liner rather than refused.
        None => {
            let derived = name_from(spec.description.as_deref().unwrap_or_default());
            if derived.is_empty() {
                return Err("pass a name, or an --about line to take one from".into());
            }
            derived
        }
    };

    let path = dir.join(format!("{name}.md"));
    let malformed = || WriteError::InvalidExistingMemory {
        path: path.to_string_lossy().into_owned(),
    };
    let existing = match std::fs::read_to_string(&path) {
        Ok(text) => Some(text),
        Err(e) if e.kind() == ErrorKind::NotFound => None,
        Err(e) if e.kind() == ErrorKind::InvalidData => return Err(malformed()),
        Err(e) => return Err(format!("cannot read {}: {e}", path.display()).into()),
    };
    let created = existing.is_none();
    if created && check_room {
        ensure_room(data_dir, code)?;
    }

    let (old_front, body_suffix) = match existing.as_deref() {
        Some(text) => parse_with_body_suffix(text).ok_or_else(malformed)?,
        None => (Front::default(), ""),
    };
    let old_body = body_suffix.trim_start_matches('\n');
    let mut front = old_front.clone();
    front.name = name.clone();
    if let Some(title) = spec.title {
        front.title = Some(title);
    }
    if let Some(about) = spec.description {
        front.description = about;
    }
    if front.description.trim().is_empty() {
        return Err("--about is the line the index shows; a memory needs one".into());
    }

    let kind = match spec.kind {
        Some(k) => k,
        None => front
            .meta("type")
            .map(String::from)
            .ok_or("--type is one of user, feedback, project, reference")?,
    };
    if !TYPES.contains(&kind.as_str()) {
        return Err(format!("unknown type {kind} — one of {}", TYPES.join(", ")).into());
    }

    let mut body = spec.body.as_deref().unwrap_or(old_body).trim().to_string();
    if let Some(why) = spec.why.as_deref().filter(|w| !w.trim().is_empty()) {
        if !body.contains("**Why:**") {
            body.push_str(&format!("\n\n**Why:** {}", why.trim()));
        }
    }
    if let Some(how) = spec.how.as_deref().filter(|h| !h.trim().is_empty()) {
        if !body.contains("**How to apply:**") {
            body.push_str(&format!("\n\n**How to apply:** {}", how.trim()));
        }
    }
    if !spec.links.is_empty() {
        let links: Vec<String> = spec
            .links
            .iter()
            .map(|l| format!("[[{}]]", slug(l)))
            .filter(|l| !body.contains(l.as_str()))
            .collect();
        if !links.is_empty() {
            body.push_str(&format!("\n\nSee also {}.", links.join(", ")));
        }
    }
    // Ignore surrounding whitespace only. Interior whitespace is Markdown.
    let body_changed = old_body.trim() != body.trim();
    if body_changed && !old_body.trim().is_empty() && !spec.replace {
        return Err(WriteError::BodyReplacementRequired {
            current_body: old_body.to_string(),
        });
    }

    if (created || body_changed) && body.trim().is_empty() {
        return Err("a memory with no body is an index line — pass --text or --body".into());
    }
    // Instructions rather than observations owe the reason and the application,
    // or a later session cannot act on them.
    if matches!(kind.as_str(), "feedback" | "project")
        && !(body.contains("**Why:**") && body.contains("**How to apply:**"))
    {
        return Err(format!(
            "a {kind} memory carries **Why:** and **How to apply:** — pass --why and --how"
        )
        .into());
    }

    front.set_meta("type", &kind);
    if let Some(source) = spec.source {
        front.set_meta("source", &source);
    }
    for (k, v) in &spec.extra {
        front.set_meta(k, v);
    }
    let outcome = if created {
        WriteOutcome::Created
    } else if body_changed {
        WriteOutcome::BodyReplaced
    } else if front != old_front {
        WriteOutcome::MetadataUpdated
    } else {
        WriteOutcome::Unchanged
    };

    let changed = outcome != WriteOutcome::Unchanged;
    if changed {
        let today = crate::runtime::clock::today_utc();
        if front.meta("created").is_none() {
            front.set_meta("created", &today);
        }
        if !spec.extra.iter().any(|(key, _)| key == "updated") {
            front.set_meta("updated", &today);
        }
        order_meta(&mut front);

        let text = match outcome {
            WriteOutcome::MetadataUpdated => render_front(&front) + body_suffix,
            _ => render(&front, &body),
        };
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(created)
            .truncate(!created)
            .open(&path)
            .and_then(|mut file| file.write_all(text.as_bytes()))
            .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    }
    let indexed = refresh_index(data_dir, code, changed)?;

    Ok(WriteResult {
        written: Written {
            name,
            path: path.to_string_lossy().into_owned(),
            subject: code.map(String::from),
            created,
            indexed,
        },
        outcome,
    })
}

/// Refuses a new memory in a full bucket, naming what is filed there so the
/// fact can go into one of them instead.
pub(super) fn ensure_room(data_dir: &Path, code: Option<&str>) -> Result<(), String> {
    let filed = list(data_dir, code)?;
    if filed.len() < CAP {
        return Ok(());
    }
    let names: Vec<&str> = filed.iter().map(|e| e.front.name.as_str()).collect();
    Err(format!(
        "{} holds {} memories and keeps {CAP} at most, so this is not a new one. \
         Add it as a line to the memory it belongs to (`oculus memory append <name> \"<line>\"`), \
         deliberately rewrite it (`oculus memory write <name> --replace --body <file>`), \
         or fold two that overlap (`oculus memory fold <a> <b> --into <a> --body <file>`). \
         Filed there: {}",
        code.unwrap_or("The cross-subject bucket"),
        filed.len(),
        names.join(", ")
    ))
}
