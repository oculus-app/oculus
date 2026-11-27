import { describe, expect, test } from "bun:test";
import { fullCitation, parseCitation, remarkProsePaths } from "@/lib/citations";

const DATA = "/Users/x/Library/Application Support/com.tchan.oculus";
const path = (raw: string) => fullCitation(raw)?.path ?? null;

// Stored chats are never rewritten, so every spelling an agent wrote in
// either layout parses, to the data-dir-relative path the file is at.

describe("a path from the agents' cwd", () => {
  test("is in .oculus/agents/", () => {
    expect(path("./x.md")).toBe(".oculus/agents/x.md");
    expect(path("./notes/x.md")).toBe(".oculus/agents/notes/x.md");
    expect(path("attachments/x.png")).toBe(".oculus/agents/attachments/x.png");
    expect(path("outputs/x.svg")).toBe(".oculus/agents/outputs/x.svg");
    expect(path("./outputs/x.svg")).toBe(".oculus/agents/outputs/x.svg");
  });
});

describe("a course path", () => {
  const file = "courses/COMP30024/Course/Files/week-7.pdf";

  test("reads the same from the data dir and from either cwd", () => {
    expect(path(file)).toBe(file);
    expect(path(`../../${file}`)).toBe(file);
    expect(path(`../${file}`)).toBe(file);
  });

  test("keeps its location in every spelling", () => {
    expect(fullCitation(`../../${file}#page=4`)).toMatchObject({ path: file, page: 4 });
    expect(fullCitation(`../${file}:12-15`)).toMatchObject({ path: file, line: { from: 12, to: 15 } });
  });

  test("absolute, under the data dir or any courses/ folder", () => {
    expect(path(`${DATA}/${file}`)).toBe(file);
    expect(path(`/Volumes/Backup/${file}`)).toBe(file);
    expect(path(`file://${DATA}/${file}`)).toBe(file);
  });
});

describe("the agents' folder", () => {
  test("data-dir-relative, in the spelling it has and the one older chats hold", () => {
    expect(path(".oculus/agents/outputs/plot.png")).toBe(".oculus/agents/outputs/plot.png");
    expect(path("agents/outputs/plot.png")).toBe(".oculus/agents/outputs/plot.png");
    expect(path("agents/memories/COMP30024/exam-tips.md")).toBe(".oculus/agents/memories/COMP30024/exam-tips.md");
    expect(path("agents/outputs/what?.md")).toBe(".oculus/agents/outputs/what?.md");
  });

  test("up from the cwd, in either layout", () => {
    expect(path("../agents/outputs/plot.png")).toBe(".oculus/agents/outputs/plot.png");
    expect(path("../../.oculus/agents/outputs/plot.png")).toBe(".oculus/agents/outputs/plot.png");
  });

  test("absolute, in either layout", () => {
    expect(path(`${DATA}/.oculus/agents/outputs/plot.png`)).toBe(".oculus/agents/outputs/plot.png");
    expect(path(`${DATA}/agents/outputs/plot.png`)).toBe(".oculus/agents/outputs/plot.png");
    expect(fullCitation(`${DATA}/agents/outputs/notes.md:L12`)).toMatchObject({
      path: ".oculus/agents/outputs/notes.md",
      line: { from: 12, to: 12 },
    });
  });

  test("a subject's own .oculus/agents/ is a course path", () => {
    const own = "courses/X/.oculus/agents/INSTRUCTIONS.md";
    expect(path(own)).toBe(own);
    expect(path(`${DATA}/${own}`)).toBe(own);
  });

  test("an agents/ folder outside the data dir is not the library's", () => {
    expect(path("/Users/x/code/agents/outputs/plot.png")).toBeNull();
    expect(path("/Users/x/code/.oculus/agents/outputs/plot.png")).toBeNull();
  });
});

describe("a path bare in prose", () => {
  const chips = (value: string) => {
    const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value }] }] };
    remarkProsePaths()(tree);
    return tree.children[0].children.filter((n) => n.type === "inlineCode").map((n) => n.value);
  };

  test("becomes a chip from either cwd and in either absolute layout", () => {
    expect(chips("See ../../courses/X/Course/Files/a.pdf, ../courses/X/b.md:12 and courses/X/c.pdf.")).toEqual([
      "../../courses/X/Course/Files/a.pdf",
      "../courses/X/b.md:12",
      "courses/X/c.pdf",
    ]);
    expect(chips(`Wrote ${DATA}/.oculus/agents/outputs/a.md and ${DATA}/agents/outputs/b.md.`)).toEqual([
      `${DATA}/.oculus/agents/outputs/a.md`,
      `${DATA}/agents/outputs/b.md`,
    ]);
  });

  test("stays prose three steps up", () => {
    expect(chips("See ../../../courses/X/a.pdf.")).toEqual([]);
  });
});

describe("a student's own path at the data dir's top", () => {
  test("up from the cwd and absolute under the data dir", () => {
    expect(path("../../Receipts/march.pdf")).toBe("Receipts/march.pdf");
    expect(path("../../timetable.png")).toBe("timetable.png");
    expect(path(`${DATA}/Receipts/march.pdf`)).toBe("Receipts/march.pdf");
    expect(fullCitation("../../Receipts/march.pdf#page=3")).toMatchObject({ path: "Receipts/march.pdf", page: 3 });
  });

  test("as a mention spells it, only where a mention can be", () => {
    const mention = (raw: string) => fullCitation(raw, { topLevel: true })?.path ?? null;
    expect(mention("Receipts/march.pdf")).toBe("Receipts/march.pdf");
    expect(mention("Receipts/")).toBe("Receipts/");
    expect(mention("timetable.png")).toBe("timetable.png");
    expect(path("Receipts/march.pdf")).toBeNull();
    for (const code of ["x", "len(x)", "numpy.array", ".oculus/oculus.db", ".library-move/done", "outputs/a.png"])
      expect(mention(code)).not.toBe(code);
  });

  test("in prose, a file in folders is looked up, not assumed", () => {
    expect(parseCitation("Receipts/march.pdf")).toMatchObject({ kind: "tail", tail: "Receipts/march.pdf" });
    expect(parseCitation("src/main.rs")).toBeNull();
  });

  test("never a state folder an older chat spells at the top", () => {
    for (const raw of [
      `${DATA}/studio/videos/x/script.md`,
      `${DATA}/whiteboard-pages/7/page-004.png`,
      "../../studio/videos/x/script.md",
    ]) {
      expect(parseCitation(raw, { tails: false })).toBeNull();
    }
    expect(fullCitation("studio/videos/x/script.md", { topLevel: true })).toBeNull();
  });
});

describe("refused", () => {
  test("a step up that lands outside the roots", () => {
    for (const raw of [
      "../secrets.md",
      "../../.oculus/oculus.db",
      "../../.library-move/done",
      "../../.oculus/vault/keys.md",
      "../oculus.db",
      "../studio/videos/x/script.md",
      "../../../courses/X/a.pdf",
      "../../../../etc/passwd.md",
    ]) {
      expect(parseCitation(raw, { tails: false })).toBeNull();
    }
  });

  test("a parent segment anywhere past the leading steps", () => {
    for (const raw of [
      "courses/X/../../secrets.md",
      "../courses/../secrets.md",
      "../../courses/X/../../.oculus/oculus.db",
      "./../x.md",
      "./outputs/../../x.md",
      "outputs/../x.svg",
      "agents/../oculus.db",
      ".oculus/agents/../oculus.db",
      ".oculus/agents/outputs/..",
      `${DATA}/courses/X/../../.oculus/oculus.db`,
      `${DATA}/.oculus/agents/../oculus.db`,
      "courses/X/%2e%2e/%2e%2e/secrets.md",
    ]) {
      expect(parseCitation(raw)).toBeNull();
    }
  });

  test("a backslash or a control character", () => {
    for (const raw of ["courses\\X\\a.pdf", "courses/X/a%5c..%5cb.pdf", "outputs/a\u0000.md", "courses/X/a\u001f.pdf", "./a%0a.md"]) {
      expect(parseCitation(raw)).toBeNull();
    }
  });

  test("state folders that are not a citation root", () => {
    for (const raw of [
      ".oculus/oculus.db",
      ".oculus/studio/videos/x/script.md",
      "studio/videos/x/script.md",
      ".oculus/whiteboard-pages/7/page-004.png",
      `${DATA}/.oculus/studio/videos/x/script.md`,
      `${DATA}/.oculus/oculus.db`,
    ]) {
      expect(parseCitation(raw, { tails: false })).toBeNull();
    }
  });
});
