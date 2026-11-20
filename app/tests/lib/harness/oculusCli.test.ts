import { describe, expect, test } from "bun:test";
import { describeOculusCli, shellCommands, summariseOculusCli } from "@/lib/harness";
import { parseShell, unwrapShell } from "@/lib/harness/cliArgs";

const title = (line: string, done = true, output = "") =>
  summariseOculusCli(describeOculusCli(line, { ok: done ? true : null, output }));

describe("oculus CLI row titles", () => {
  test("shell lines split at separators, keep quotes and drop pipes and redirects", () => {
    expect(shellCommands(`oculus grep "a|b" -n 25 2>&1 | head -30 && oculus memory list`)).toEqual([
      ["oculus", "grep", "a|b", "-n", "25"],
      ["oculus", "memory", "list"],
    ]);
    expect(shellCommands(`cd 'my dir'; oculus read x.pdf`)).toEqual([["cd", "my dir"], ["oculus", "read", "x.pdf"]]);
  });

  test("a stored Codex row's shell wrapper unwraps only around one literal script", () => {
    expect(unwrapShell(`/bin/zsh -lc 'oculus memory list -s COMP30026_2026_SM2'`)).toBe("oculus memory list -s COMP30026_2026_SM2");
    expect(unwrapShell(`bash -c "oculus grep \\"a|b\\" -n 3"`)).toBe(`oculus grep "a|b" -n 3`);
    expect(unwrapShell(`./bin/sh -lc 'echo '\\''quoted'\\'''`)).toBe("echo 'quoted'");
    for (const raw of [`sh -c "ls $folder"`, `sh -lc 'ls' | head`, `fish -lc 'oculus read x'`, `sh -c 'x' extra`, `sh -lc 'ls`])
      expect(unwrapShell(raw)).toBe(raw);
    expect(title(`/bin/zsh -lc 'oculus memory list -s COMP30026_2026_SM2'`))
      .toEqual({ title: "Listed memories", em: "COMP30026", icon: "memory" });
  });

  test("a heredoc is the command's stdin, not more commands", () => {
    expect(parseShell(`oculus memory write gaps --body - <<'EOF'\n- one\n- oculus read x\nEOF`)).toEqual({
      commands: [["oculus", "memory", "write", "gaps", "--body", "-"]],
      combinedStatus: false,
    });
    expect(parseShell(`oculus memory write gaps --body - <<-EOF\n\tline\n\tEOF\noculus memory list`)).toEqual({
      commands: [["oculus", "memory", "write", "gaps", "--body", "-"], ["oculus", "memory", "list"]],
      combinedStatus: true,
    });
  });

  test("memory commands say what happened to which memory", () => {
    expect(title(`oculus memory write misconception-deutsch-ancilla -s MULT20015_2026_SM2 --type reference --about "Deutsch algorithm confusion" --text "…"`))
      .toEqual({ title: "Finished a memory write", em: "Deutsch algorithm confusion", icon: "memory" });
    expect(title(`oculus memory write lab5-is-dj-template --text x`, false)?.title).toBe("Writing a memory");
    expect(title(`oculus memory read tensor-factor-working-style -s MULT20015_2026_SM2`))
      .toEqual({ title: "Read memory", em: "tensor-factor-working-style", icon: "memory" });
    expect(title(`oculus memory list -s MULT20015_2026_SM2`)?.em).toBe("MULT20015");
    expect(title(`oculus memory list --all`)?.em).toBe("all subjects");
    expect(title(`oculus memory append gaps "Grover: dummy vs counting qubits — open" -s MULT20015`))
      .toEqual({ title: "Appended a line to", em: "Gaps", icon: "memory" });
    expect(title(`oculus memory fold a2-q4c-period-method a2-q4a-rsa-answer --into assignment-2 --body /tmp/a2.md`))
      .toEqual({ title: "Folded memories into", em: "Assignment 2", icon: "memory" });
  });

  test("library searches and reads name the query, file and subject", () => {
    expect(title(`oculus grep "word limit" -n 25`))
      .toEqual({ title: "Searched the library for", em: `"word limit"`, icon: "search" });
    expect(title(`oculus search "phase kickback" -s MULT20015`, false))
      .toEqual({ title: "Searching the library for", em: `"phase kickback" · MULT20015`, icon: "search" });
    expect(title(`oculus read courses/COMP30026_2026_SM2/Course/Files/15.pdf -p 3-5`)?.em).toBe("15.pdf · p. 3-5 · COMP30026");
    expect(title(`/Applications/Oculus.app/Contents/MacOS/oculus read Lecture_8.pdf`)?.em).toBe("Lecture_8.pdf");
  });

  test("a chain of one command is counted; a mixed chain is titled by its first", () => {
    const moves = Array.from({ length: 7 }, (_, i) => `oculus task move ${113 + i} -c todo`).join(" && ");
    expect(title(moves)).toEqual({ title: "Moved 7 tasks to", em: "To do", icon: "task" });
    expect(title(`oculus task move 123 -c done`)).toEqual({ title: "Moved task to", em: "Done", icon: "task" });
    expect(title(`oculus memory read a && oculus grep x`)).toEqual({ title: "Read memory", em: "a · +1 more", icon: "memory" });
  });

  test("planning and unknown commands", () => {
    expect(title(`oculus project create "Assignment 2 — catch-up" -s MULT20015_2026_SM2 --due 2026-10-13`))
      .toEqual({ title: "Created project", em: "Assignment 2 — catch-up", icon: "project" });
    expect(title(`oculus task add --title "Revise L12" -p 4`)?.em).toBe("Revise L12");
    expect(title(`oculus --help`)).toEqual({ title: "Read command help", em: "oculus", icon: "library" });
    expect(title(`ls -la`)).toBeNull();
    expect(title(`cd oculus && BIN=/tmp/oculus oculus read "page 4.pdf"`)?.em).toBe("page 4.pdf");
  });

  test("the registered command consumes only its own words", () => {
    for (const [line, label, em, icon] of [
      ["--json widget check ./plots/demo.tsx", "Checked widget", "demo.tsx", "widget"],
      ["cheat --json show 10", "Opened cheat sheet entry", "10", "cheat"],
      ["quiz set show 10", "Opened quiz set", "10", "quiz"],
      ["artifact save --title Loom", "Saved revision artifact", "Loom", "artifact"],
      ["topic add --name Cells", "Filed revision topic", "Cells", "topic"],
      ["studio pronounce suggest video Gamma GAM-ah", "Suggested pronunciation for", "Gamma", "voice"],
      ["studio components show slug Line", "Opened Studio component", "Line", "studio"],
      ["lecture candidates REC-1", "Checked chapter boundaries", "REC-1", "lecture"],
      ["index --reparse COMP30026", "Indexed library files", "COMP30026", "index"],
      ["agent -p codex hello", "Ran agent prompt", "codex", "agent"],
      ["studio voices", "Listed Studio voices", undefined, "voice"],
      ["docs --stdout", "Read CLI reference", undefined, "library"],
      ["library migrate --dry-run", "Previewed library migration", undefined, "folder"],
      ["memory write --replace notes --help", "Read command help", "memory write", "memory"],
    ]) expect(title("oculus " + line)).toEqual({ title: label, em, icon });
    expect(title("oculus widget check -", false)?.title).toBe("Checking widget");
    expect(title("oculus cheat show 10", false)?.title).toBe("Opening cheat sheet entry");
    for (const path of ["something", "task invent", "memory invent", "studio voices invent", "quiz set invent"]) {
      expect(title("oculus " + path)).toEqual({ title: "Ran oculus", em: path, icon: "library" });
    }
  });

  test("memory write reads the machine and terminal outcomes", () => {
    for (const [outcome, label] of [
      ["created", "Created a memory"], ["metadata_updated", "Updated memory metadata"],
      ["body_replaced", "Replaced memory body"], ["unchanged", "Left memory unchanged"],
    ]) {
      for (const output of [JSON.stringify({ outcome }), outcome.replace("_", " ") + " gaps in CODE (3 of 12)"]) {
        expect(title("oculus --json memory write --replace gaps", true, output))
          .toEqual({ title: label, em: "Gaps", icon: "memory" });
      }
    }
    expect(title('oculus memory append --replace old gaps ""')?.title).toBe("Removed a line from");
    expect(title("oculus memory append --replace old gaps new")?.title).toBe("Replaced a line in");
  });

  test("refusals and stopped tools keep the command glyph and lose the success verb", () => {
    for (const output of [
      '{"code":"body_replacement_required","error":"...","current_body":"private text"}\nexit code 1',
      '{"code":"invalid_existing_memory","error":"...","path":"..."}',
      'error: This memory already has text. Use `oculus memory append` to add a line',
      'error: cannot parse existing memory /some/file',
    ]) {
      const actions = describeOculusCli("oculus memory write gaps", { ok: false, output });
      expect(summariseOculusCli(actions)).toEqual({ title: "Memory write refused", em: "Gaps", icon: "memory" });
      expect(actions[0].tally(1)).toBe("memory write refused");
    }
    const line = "oculus artifact save --title Demo";
    for (const [meta, expected] of [
      [{ ok: false, output: "disk full" }, "Command failed"],
      [{ ok: false, output: "the session ended before this finished" }, "Command stopped"],
      [{ ok: null, review: { status: "denied" } }, "Command refused"],
      [{ ok: null }, "Command stopped"],
    ] as const) {
      expect(summariseOculusCli(describeOculusCli(line, meta, false)))
        .toEqual({ title: expected, em: "artifact save · Demo", icon: "artifact" });
    }
    expect(summariseOculusCli(describeOculusCli("oculus task rm 7", { ok: false,
      output: '{"error":"propose this with `DeleteTasks` — see the `oculus-plan` skill"}' }))?.title).toBe("Command refused");
  });

  test("one exit code never supplies per-command results for a failed chain or pipeline", () => {
    const failed = describeOculusCli("oculus widget check bad && oculus quiz add -s X", { ok: false });
    expect(failed).toHaveLength(1);
    expect(failed[0].title(1)).toBe("Command chain failed");
    expect(title("oculus quiz add -s X; oculus quiz list")?.title).toBe("Ran command chain");
    expect(title("oculus quiz add -s X | head")?.title).toBe("Ran shell command");
    expect(title("echo oculus tag list")).toBeNull();
    expect(title(String.raw`"C:\Program Files\Oculus\oculus.exe" cheat show 10`)?.em).toBe("10");
  });
});
