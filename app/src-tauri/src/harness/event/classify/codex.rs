//! A display title for Codex's commandExecution item. Approval requests use the wire command.

use super::ToolKind;
use regex::Regex;
use std::sync::LazyLock;

// One literal shell word. Adjacent quoted spans are one argument. Expansions and
// shell operators outside single quotes need more context, so keep those calls verbatim.
static WORD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)^(?:[\w./,:@%+=-]+|'[^']*'|"(?:[^"\\$`]|\\.)*"|\\.)+"#).unwrap()
});

fn word<'a>(rest: &mut &'a str) -> Option<&'a str> {
    let m = WORD.find(rest)?;
    let (word, tail) = rest.split_at(m.end());
    *rest = tail.trim_start_matches([' ', '\t']);
    Some(word)
}

fn literal(raw: &str) -> Option<String> {
    let mut words = shlex::split(raw)?;
    (words.len() == 1).then(|| words.remove(0))
}

static ASSIGNMENT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z_][a-zA-Z_0-9]*=").unwrap());

fn inner(command: &str) -> Option<String> {
    let mut rest = command.trim_matches([' ', '\t']);
    let raw = word(&mut rest)?;
    if ASSIGNMENT.is_match(raw) {
        return None;
    }
    let executable = literal(raw)?;
    if !matches!(executable.rsplit('/').next(), Some("zsh" | "bash" | "sh"))
        || !matches!(word(&mut rest)?, "-lc" | "-c")
    {
        return None;
    }
    let script = word(&mut rest)?;
    rest.is_empty().then(|| literal(script))?
}

// Every command in a CLI summary must be accounted for. A pipeline, redirect,
// substitution or mixed chain keeps the whole script as its shell label.
pub(super) fn cli_chain(line: &str) -> bool {
    let mut rest = line.trim_matches([' ', '\t', '\n']);
    while let Some(mut raw) = word(&mut rest) {
        while ASSIGNMENT.is_match(raw) || matches!(raw, "env" | "time") {
            let Some(next) = word(&mut rest) else {
                return false;
            };
            raw = next;
        }
        let Some(executable) = literal(raw).filter(|_| !ASSIGNMENT.is_match(raw)) else {
            return false;
        };
        // shlex treats unquoted Windows path separators as escapes.
        let path = if raw.as_bytes().get(1) == Some(&b':') {
            raw
        } else {
            &executable
        };
        let name = path.rsplit(['/', '\\']).next().unwrap_or_default();
        let cli = name.eq_ignore_ascii_case("oculus") || name.eq_ignore_ascii_case("oculus.exe");
        let cd = executable == "cd";
        if !cli && !cd {
            return false;
        }
        // `2>&1` would otherwise read as the word `2` and a redirect.
        while !(cli && STDIO.is_match(rest)) && word(&mut rest).is_some() {}
        if cli {
            rest = own_stdio(rest);
        }
        if rest.is_empty() {
            return cli;
        }
        if cd && !rest.starts_with("&&") {
            return false;
        }
        let Some(tail) = rest
            .strip_prefix("&&")
            .or_else(|| rest.strip_prefix(';'))
            .or_else(|| rest.strip_prefix('\n'))
        else {
            return false;
        };
        rest = tail.trim_start_matches([' ', '\t', '\n']);
    }
    false
}

// Redirects that keep the call's exit status and stdout its own: stderr folded
// or dropped, and stdin from a file or a heredoc.
static STDIO: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:2>&1|2>[ \t]*/dev/null|<[ \t]*[\w./-]+)[ \t]*").unwrap());
static HEREDOC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"^<<(-?)[ \t]*(?:'(\w+)'|"(\w+)"|(\w+))[ \t]*(?:\n|$)"#).unwrap()
});

fn own_stdio(mut rest: &str) -> &str {
    while let Some(m) = STDIO.find(rest) {
        rest = &rest[m.end()..];
    }
    let Some(c) = HEREDOC.captures(rest) else {
        return rest;
    };
    let tabs = !c[1].is_empty();
    let delimiter = c
        .get(2)
        .or(c.get(3))
        .or(c.get(4))
        .map_or("", |m| m.as_str());
    // Return from the newline that closes the delimiter line, so it separates
    // the next command as it does in the shell.
    let mut body = &rest[c.get(0).map_or(0, |m| m.end())..];
    while !body.is_empty() {
        let end = body.find('\n').unwrap_or(body.len());
        let line = &body[..end];
        let line = if tabs {
            line.trim_start_matches('\t')
        } else {
            line
        };
        if line == delimiter {
            return &body[end..];
        }
        body = body.get(end + 1..).unwrap_or("");
    }
    // An unterminated heredoc is not a call we can account for.
    "<<"
}

pub(super) fn display(command: String) -> (ToolKind, String) {
    let line = inner(&command).unwrap_or(command);
    let kind = if cli_chain(&line) {
        ToolKind::OculusCli
    } else {
        ToolKind::Bash
    };
    (kind, line)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unwraps_one_literal_script() {
        for (raw, title) in [
            ("/bin/zsh -lc ls", "ls"),
            ("bash -c \"printf 'a b'\nls\"", "printf 'a b'\nls"),
            ("./bin/sh -lc 'echo '\\''quoted'\\'''", "echo 'quoted'"),
            ("sh -c 'bash -c ls'", "bash -c ls"),
        ] {
            assert_eq!(display(raw.into()), (ToolKind::Bash, title.into()), "{raw}");
        }
    }

    #[test]
    fn titles_only_literal_oculus_calls_and_chains() {
        for line in [
            "oculus read 'page 4.pdf'",
            "env LANG=C oculus read x",
            "'/path with spaces/oculus' read x",
            "./bin/oculus read 'a|b' && oculus read b",
            "cd 'my folder' && oculus read a;\noculus read b",
            "oculus quiz add --batch f.json 2>&1",
            "oculus read x 2>/dev/null && oculus read y",
            "oculus memory write a --body - < body.md",
            "oculus memory write a --body - <<'EOF'\n- one\n- two\nEOF",
            "oculus memory write a --body - <<-EOF\n\tline\n\tEOF\noculus memory list",
        ] {
            // shlex quotes the argument as a literal, as Codex does for its wire command.
            let raw = format!("zsh -lc {}", shlex::try_quote(line).unwrap());
            assert_eq!(display(raw), (ToolKind::OculusCli, line.into()));
        }
    }

    #[test]
    fn shell_syntax_keeps_the_whole_script_on_the_row() {
        for line in [
            "echo oculus read x",
            "BIN=/tmp/oculus echo hello",
            "oculus read x | head",
            "oculus read x >log",
            "oculus read x 2>&1 | head",
            "oculus memory write a --body - <<EOF\nx\n",
            "echo $(oculus read x)",
            "oculus read $(get_path)",
            "oculus read a && echo done",
            "oculus read \"unfinished",
            "oculus read a || oculus read b",
        ] {
            let raw = format!("sh -c '{}'", line);
            assert_eq!(display(raw), (ToolKind::Bash, line.into()));
        }
    }

    #[test]
    fn nonliteral_or_unrecognised_wrappers_stay_verbatim() {
        for raw in [
            "fish -lc 'oculus read x'",
            "env sh -c 'oculus read x'",
            "sh -c 'oculus read x' extra",
            "sh -lc 'ls' | head",
            "sh -lc 'ls",
            "sh -c \"ls $folder\"",
            "sh -c ls;whoami",
            "BIN=/bin/sh -c ls",
        ] {
            assert_eq!(display(raw.into()), (ToolKind::Bash, raw.into()));
        }
    }
}
