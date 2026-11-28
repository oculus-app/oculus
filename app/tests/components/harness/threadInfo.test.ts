import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { File } from "@phosphor-icons/react";
import { InfoGroup, InfoRow } from "@/components/harness/threadInfo/InfoRow";
import { CARD_TOP, GAP, MIN_COLUMN, RAIL, RESERVE, threadInfoFloats } from "@/components/harness/threadInfo/layout";
import { registerWorkKind, workKinds, type WorkKind } from "@/components/harness/threadInfo/work";
import { displayCode, humanizeSlug } from "@/lib/format/format";

describe("threadInfoFloats: the card floats only beside a column of at least MIN_COLUMN", () => {
  // The narrowest pane that fits: the rail's gutter, the narrowest column
  // and the card's reserve.
  const least = RAIL + MIN_COLUMN + RESERVE;

  test("a wide pane floats the card; one pixel narrower makes it a popover", () => {
    expect(threadInfoFloats(least, 800, 300)).toBe(true);
    expect(threadInfoFloats(least - 1, 800, 300)).toBe(false);
  });

  test("a side panel open at half width leaves no room", () => {
    expect(threadInfoFloats(1440 / 2, 800, 300)).toBe(false);
  });

  test("a card taller than the pane under the corner button is a popover, since it never scrolls", () => {
    // The card starts under the button and keeps a gap above the pane's bottom.
    const tallest = 400 - CARD_TOP - GAP;
    expect(threadInfoFloats(1400, 400, tallest)).toBe(true);
    expect(threadInfoFloats(1400, 400, tallest + 1)).toBe(false);
  });

  test("before the card has drawn, the width alone decides", () => {
    expect(threadInfoFloats(1400, 200, 0)).toBe(true);
  });
});

describe("Work kinds", () => {
  const removals: (() => void)[] = [];
  afterEach(() => removals.splice(0).forEach((r) => r()));
  const kind = (id: string, title = id): WorkKind => ({
    id,
    useRows: () => [{ key: id, icon: File, title, href: `/x/${id}` }],
  });

  test("none are registered until a feature adds one", () => {
    expect(workKinds()).toEqual([]);
  });

  test("kinds keep their first registration's order, and a re-registration replaces in place", () => {
    removals.push(registerWorkKind(kind("video")), registerWorkKind(kind("quiz")));
    const again = kind("video", "Video v2");
    removals.push(registerWorkKind(again));
    expect(workKinds().map((k) => k.id)).toEqual(["video", "quiz"]);
    expect(workKinds()[0]).toBe(again);
  });

  test("a removal takes only its own kind, once", () => {
    const remove = registerWorkKind(kind("video"));
    removals.push(registerWorkKind(kind("quiz")));
    remove();
    remove();
    expect(workKinds().map((k) => k.id)).toEqual(["quiz"]);
  });
});

describe("InfoGroup leading rows", () => {
  test("renders leading Work rows before file rows and hides an empty group unless leading renders a row", () => {
    const withFiles = renderToStaticMarkup(
      createElement(InfoGroup<string>, {
        heading: "Made",
        rows: ["script.md"],
        render: (name) => createElement(InfoRow, { key: name, icon: null, label: name }),
        leading: createElement(InfoRow, { key: "video", icon: null, label: "Qantas", trailing: "Draft ready" }),
      }),
    );
    expect(withFiles.indexOf("Qantas")).toBeLessThan(withFiles.indexOf("script.md"));
    expect(withFiles).not.toContain("has-[[data-info-row]]:flex");

    const leadingOnly = renderToStaticMarkup(
      createElement(InfoGroup<string>, {
        heading: "Made",
        rows: [],
        render: (name) => createElement(InfoRow, { key: name, icon: null, label: name }),
        leading: createElement(InfoRow, { key: "video", icon: null, label: "Qantas" }),
      }),
    );
    expect(leadingOnly).toContain("has-[[data-info-row]]:flex");
    expect(leadingOnly).toContain("Qantas");

    const empty = renderToStaticMarkup(
      createElement(InfoGroup<string>, {
        heading: "Made",
        rows: [],
        render: (name) => createElement(InfoRow, { key: name, icon: null, label: name }),
      }),
    );
    expect(empty).toBe("");
  });
});

describe("EntryRow names the agents' own files", () => {
  // The row's opener reaches modules that listen on `window` and `document`
  // at load; they get inert stand-ins for the import, then the globals go back.
  const load = async () => {
    const globals = globalThis as { window?: unknown; document?: unknown };
    const before = { window: globals.window, document: globals.document };
    const inert = { addEventListener: () => {}, removeEventListener: () => {} };
    globals.window ??= inert;
    globals.document ??= { ...inert, documentElement: { style: {} } };
    try {
      return await import("@/components/harness/threadInfo/EntryRow");
    } finally {
      Object.assign(globals, before);
    }
  };
  const row = async (path: string) => {
    const { EntryRow } = await load();
    const entry = { key: path, target: { kind: "library" as const, path }, path, pages: [], times: [], made: "new" as const, last: 0 };
    return renderToStaticMarkup(createElement(EntryRow, { entry, lectureTitle: () => undefined }));
  };

  test("a memory by its name or its bucket's subject, with no New", async () => {
    const memory = await row(".oculus/agents/memories/COMP30024/exam-tips.md");
    expect(memory).toContain(humanizeSlug("exam-tips"));
    expect(memory).not.toContain("New");
    expect(await row(".oculus/agents/memories/COMP30024/")).toContain(`Memories · ${displayCode("COMP30024")}`);
    expect(await row(".oculus/agents/memories/")).toContain(">Memories<");
  });

  test("an output by its file name, marked New", async () => {
    const output = await row(".oculus/agents/outputs/plot.png");
    expect(output).toContain(">plot.png<");
    expect(output).toContain(">New<");
  });
});
