//! Recognise a successful Studio creation from the shell tool dialects.

use serde_json::Value;

pub fn is_studio_new(name: &str, input: &Value) -> bool {
    let keys: &[&str] = match name {
        "Bash" | "bash" | "commandExecution" => &["command"],
        "run_command" => &["CommandLine", "Command"],
        _ => return false,
    };
    keys.iter().filter_map(|key| input.get(key)?.as_str()).any(|line| has_new(line, 0))
}

fn has_new(line: &str, depth: usize) -> bool {
    if depth > 3 { return false; }
    commands(line).iter().any(|words| {
        let mut at = 0;
        while words.get(at).is_some_and(|w| w.contains('=') || matches!(w.as_str(), "env" | "time" | "command")) { at += 1; }
        let Some(exe) = words.get(at) else { return false; };
        let base = exe.rsplit(['/', '\\']).next().unwrap_or(exe);
        if matches!(base, "sh" | "bash" | "zsh") {
            return words.get(at + 1).is_some_and(|w| matches!(w.as_str(), "-c" | "-lc"))
                && words.get(at + 2).is_some_and(|w| has_new(w, depth + 1));
        }
        if !base.eq_ignore_ascii_case("oculus") && !base.eq_ignore_ascii_case("oculus.exe") { return false; }
        at += 1;
        while words.get(at).is_some_and(|w| matches!(w.as_str(), "--json" | "--no-color")) { at += 1; }
        words.get(at).is_some_and(|w| w == "studio") && words.get(at + 1).is_some_and(|w| w == "new")
    })
}

/// Shell words with quotes respected; separators split commands, redirects
/// and pipelines end the part inspected. Quoted prose is never a command.
fn commands(line: &str) -> Vec<Vec<String>> {
    let mut out = Vec::new();
    let mut words = Vec::new();
    let mut word = String::new();
    let mut quote = None;
    let mut drop = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if let Some(q) = quote {
            if c == q { quote = None; }
            else if c == '\\' && q == '"' { if let Some(next) = chars.next() { word.push(next); } }
            else { word.push(c); }
        } else if c == '\'' || c == '"' { quote = Some(c); }
        else if c == '\\' { if let Some(next) = chars.next() { word.push(next); } }
        else if c.is_whitespace() || matches!(c, ';' | '&' | '|' | '>' | '<') {
            if !word.is_empty() { if !drop { words.push(std::mem::take(&mut word)); } else { word.clear(); } }
            if c == ';' || c == '\n' || (c == '&' && chars.peek() == Some(&'&')) || (c == '|' && chars.peek() == Some(&'|')) {
                if matches!(c, '&' | '|') { chars.next(); }
                if !words.is_empty() { out.push(std::mem::take(&mut words)); }
                drop = false;
            } else if matches!(c, '|' | '>' | '<' | '&') { drop = true; }
        } else { word.push(c); }
    }
    if !drop && !word.is_empty() { words.push(word); }
    if quote.is_none() && !words.is_empty() { out.push(words); }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn four_shell_dialects_and_wrappers() {
        for (name, input) in [
            ("Bash", json!({"command":"oculus studio new minimax --theme chalk"})),
            ("commandExecution", json!({"command":"/bin/zsh -lc 'oculus studio new minimax'"})),
            ("bash", json!({"command":"cd ../studio && OCULUS_AGENT=1 oculus --json studio new minimax"})),
            ("run_command", json!({"CommandLine":"oculus studio new minimax"})),
        ] { assert!(is_studio_new(name, &input), "{name}: {input}"); }
        for line in ["echo 'oculus studio new minimax'", "cat script.md", "oculus studio render minimax", "myoculus studio new minimax", "echo x | oculus studio new minimax"] {
            assert!(!is_studio_new("Bash", &json!({"command":line})), "{line}");
        }
        assert!(!is_studio_new("Read", &json!({"command":"oculus studio new x"})));
    }
}
