//! Recognise a successful Studio creation from the shell tool dialects.

use serde_json::Value;

/// The slugs a shell tool's command asked `oculus studio new` to make, in
/// order, scratch videos left out.
pub fn new_slugs(name: &str, input: &Value) -> Vec<String> {
    let keys: &[&str] = match name {
        "Bash" | "bash" | "commandExecution" => &["command"],
        "run_command" => &["CommandLine", "Command"],
        _ => return Vec::new(),
    };
    let mut out = Vec::new();
    for line in keys.iter().filter_map(|key| input.get(key)?.as_str()) {
        collect(line, false, 0, &mut out);
    }
    out
}

/// Flags of `studio new` that take a value, so the word after one is not
/// the slug.
const VALUED: &[&str] = &["--theme", "--subject", "--title"];

fn collect(line: &str, windows: bool, depth: usize, out: &mut Vec<String>) {
    if depth > 3 {
        return;
    }
    for words in commands(line, windows) {
        let mut at = 0;
        while words
            .get(at)
            .is_some_and(|w| w.contains('=') || matches!(w.as_str(), "env" | "time" | "command"))
        {
            at += 1;
        }
        let Some(exe) = words.get(at) else {
            continue;
        };
        let base = exe
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or(exe)
            .to_ascii_lowercase();
        let base = base.strip_suffix(".exe").unwrap_or(&base);
        if matches!(base, "sh" | "bash" | "zsh") {
            if words
                .get(at + 1)
                .is_some_and(|w| matches!(w.as_str(), "-c" | "-lc"))
            {
                if let Some(inner) = words.get(at + 2) {
                    collect(inner, false, depth + 1, out);
                }
            }
            continue;
        }
        // Codex on Windows runs `powershell.exe -Command '…'`; the rest of
        // the words are the command, with backslashes as path separators.
        if matches!(base, "powershell" | "pwsh" | "cmd") {
            let switch = words[at + 1..]
                .iter()
                .position(|w| matches!(w.to_ascii_lowercase().as_str(), "-command" | "-c" | "/c"));
            if let Some(i) = switch {
                let inner = words[at + 2 + i..].join(" ");
                collect(&inner, true, depth + 1, out);
            }
            continue;
        }
        if base != "oculus" {
            continue;
        }
        at += 1;
        while words
            .get(at)
            .is_some_and(|w| matches!(w.as_str(), "--json" | "--no-color"))
        {
            at += 1;
        }
        if words.get(at).map(String::as_str) != Some("studio")
            || words.get(at + 1).map(String::as_str) != Some("new")
        {
            continue;
        }
        let args = &words[at + 2..];
        // A scratch video checks a library item and belongs to no thread.
        if args.iter().any(|w| w == "--scratch") {
            continue;
        }
        let mut i = 0;
        while let Some(arg) = args.get(i) {
            if !arg.starts_with('-') {
                out.push(arg.clone());
                break;
            }
            i += if VALUED.contains(&arg.as_str()) { 2 } else { 1 };
        }
    }
}

/// Shell words with quotes respected; separators split commands, redirects
/// and pipelines end the part inspected. Quoted prose is never a command.
fn commands(line: &str, windows: bool) -> Vec<Vec<String>> {
    let mut out = Vec::new();
    let mut words = Vec::new();
    let mut word = String::new();
    let mut quote = None;
    let mut drop = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if let Some(q) = quote {
            if c == q {
                quote = None;
            } else if c == '\\'
                && q == '"'
                && !windows
                && chars
                    .peek()
                    .is_some_and(|n| matches!(n, '$' | '`' | '"' | '\\' | '\n'))
            {
                // Inside double quotes a backslash escapes only these, as in
                // sh; `"C:\Users"` keeps its separator.
                word.push(chars.next().unwrap_or(c));
            } else {
                word.push(c);
            }
        } else if c == '\'' || c == '"' {
            quote = Some(c);
        } else if c == '\\' && !windows {
            if let Some(next) = chars.next() {
                word.push(next);
            }
        } else if windows && c == '&' && chars.peek() != Some(&'&') {
            // PowerShell's call operator: `& 'C:\…\oculus.exe' studio …`.
            if !word.is_empty() && !drop {
                words.push(std::mem::take(&mut word));
            }
        } else if c.is_whitespace() || matches!(c, ';' | '&' | '|' | '>' | '<') {
            if !word.is_empty() {
                if !drop {
                    words.push(std::mem::take(&mut word));
                } else {
                    word.clear();
                }
            }
            if c == ';'
                || c == '\n'
                || (c == '&' && chars.peek() == Some(&'&'))
                || (c == '|' && chars.peek() == Some(&'|'))
            {
                if matches!(c, '&' | '|') {
                    chars.next();
                }
                if !words.is_empty() {
                    out.push(std::mem::take(&mut words));
                }
                drop = false;
            } else if matches!(c, '|' | '>' | '<' | '&') {
                drop = true;
            }
        } else {
            word.push(c);
        }
    }
    if !drop && !word.is_empty() {
        words.push(word);
    }
    if quote.is_none() && !words.is_empty() {
        out.push(words);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn four_shell_dialects_and_wrappers() {
        for (name, input) in [
            (
                "Bash",
                json!({"command":"oculus studio new minimax --theme chalk"}),
            ),
            (
                "commandExecution",
                json!({"command":"/bin/zsh -lc 'oculus studio new minimax'"}),
            ),
            (
                "bash",
                json!({"command":"cd ../studio && OCULUS_AGENT=1 oculus --json studio new minimax"}),
            ),
            (
                "run_command",
                json!({"CommandLine":"oculus studio new minimax"}),
            ),
        ] {
            assert!(!new_slugs(name, &input).is_empty(), "{name}: {input}");
        }
        for line in [
            "echo 'oculus studio new minimax'",
            "cat script.md",
            "oculus studio render minimax",
            "myoculus studio new minimax",
            "echo x | oculus studio new minimax",
            "oculus studio new scratch-card --scratch",
        ] {
            assert!(
                new_slugs("Bash", &json!({"command":line})).is_empty(),
                "{line}"
            );
        }
        assert!(new_slugs("Read", &json!({"command":"oculus studio new x"})).is_empty());
    }

    #[test]
    fn windows_shells_and_paths() {
        for line in [
            r#"powershell.exe -NoProfile -Command "oculus studio new minimax""#,
            r#"pwsh -c 'C:\Users\me\AppData\Local\Oculus\oculus.exe studio new minimax'"#,
            r#"cmd /c oculus.exe studio new minimax"#,
            r#"powershell -Command "& 'C:\Program Files\Oculus\OCULUS.EXE' studio new minimax""#,
        ] {
            assert_eq!(
                new_slugs("commandExecution", &json!({ "command": line })),
                vec!["minimax".to_owned()],
                "{line}"
            );
        }
    }

    #[test]
    fn the_slug_skips_valued_flags_and_scratch_lines() {
        let slugs = |line: &str| new_slugs("Bash", &json!({ "command": line }));
        assert_eq!(
            slugs("oculus studio new --theme chalk --title 'Week 7' w7"),
            ["w7"]
        );
        assert_eq!(
            slugs("oculus studio new tmp --scratch && oculus studio new real"),
            ["real"]
        );
    }
}
