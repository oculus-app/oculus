import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  caretChunk,
  chunksText,
  dropSkill,
  equalChunks,
  insertAt,
  normalize,
  pasteAt,
  removeChipByOrdinal,
  ZWSP,
  type Chunk,
} from "@/components/harness/mentions/chunks";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSkillStore } from "@/stores/chat/skillStore";

const globals = globalThis as { window?: unknown; document?: unknown };
const before = { window: globals.window, document: globals.document };
const inert = { addEventListener: () => {}, removeEventListener: () => {} };
globals.window ??= inert;
globals.document ??= { ...inert, documentElement: { style: {} } };
const { SkillPills } = await import("@/components/harness/composer/SkillPills");
const { Composer, skillsInText } = await import("@/components/harness/composer/Composer");
Object.assign(globals, before);

const text = (t: string): Chunk => ({ kind: "text", text: t });
const skill = (name: string): Chunk => ({ kind: "skill", name });
const chip = (path: string): Chunk => ({ kind: "chip", path });
const att = (path: string): Chunk => ({ kind: "attachment", path });
const link = (raw: string): Chunk => ({ kind: "link", raw });

describe("atomic chip caret guards", () => {
  test("every atomic chip is flanked by text nodes on both sides", () => {
    expect(normalize([skill("oculus-studio")])).toEqual([text(ZWSP), skill("oculus-studio"), text(ZWSP)]);
    expect(normalize([chip("courses/M/a.md")])).toEqual([text(ZWSP), chip("courses/M/a.md"), text(ZWSP)]);
    expect(normalize([att("./attachments/a.png")])).toEqual([text(ZWSP), att("./attachments/a.png"), text(ZWSP)]);
  });

  test("adjacent chips get one guard between them and on the outer edges", () => {
    const out = normalize([skill("oculus-studio"), att("./attachments/a.png"), chip("courses/M/a.md")]);
    expect(out).toEqual([
      text(ZWSP),
      skill("oculus-studio"),
      text(ZWSP),
      att("./attachments/a.png"),
      text(ZWSP),
      chip("courses/M/a.md"),
      text(ZWSP),
    ]);
    expect(chunksText(out)).toBe("/oculus-studio`./attachments/a.png``courses/M/a.md`");
  });

  test("chips beside real text keep that text without adding redundant guards", () => {
    expect(normalize([text("hi "), skill("oculus-studio"), text(" there")])).toEqual([
      text("hi "),
      skill("oculus-studio"),
      text(" there"),
    ]);
    expect(normalize([text("hi "), skill("oculus-studio")])).toEqual([
      text("hi "),
      skill("oculus-studio"),
      text(ZWSP),
    ]);
    expect(normalize([skill("oculus-studio"), text(" there")])).toEqual([
      text(ZWSP),
      skill("oculus-studio"),
      text(" there"),
    ]);
  });

  test("a chip beside a link gets a guard between them while a bare link stays unguarded", () => {
    expect(normalize([link("https://example.com")])).toEqual([link("https://example.com")]);
    expect(normalize([link("https://example.com"), skill("oculus-studio")])).toEqual([
      link("https://example.com"),
      text(ZWSP),
      skill("oculus-studio"),
      text(ZWSP),
    ]);
  });

  test("caretChunk lands at offset 1 inside a ZWSP guard and offset 0 in real text", () => {
    const solo = normalize([skill("oculus-studio")]);
    expect(caretChunk(solo, 0)).toEqual({ chunk: 0, offset: 1 });
    expect(caretChunk(solo, "/oculus-studio".length)).toEqual({ chunk: 2, offset: 1 });

    const pair = normalize([skill("oculus-studio"), chip("courses/M/a.md")]);
    expect(caretChunk(pair, "/oculus-studio".length)).toEqual({ chunk: 2, offset: 1 });
    expect(caretChunk(pair, chunksText(pair).length)).toEqual({ chunk: 4, offset: 1 });

    const withText = normalize([skill("oculus-studio"), text(" explain")]);
    expect(caretChunk(withText, "/oculus-studio".length)).toEqual({ chunk: 2, offset: 0 });
  });

  test("dropSkill removes the skill chip and closes its surrounding space", () => {
    const solo = normalize([skill("oculus-studio"), text(" ")]);
    const cleared = dropSkill(solo, "oculus-studio", chunksText(solo).length);
    expect(cleared.chunks).toEqual([]);
    expect(cleared.caret).toBe(0);

    const prefixed = normalize([skill("oculus-studio"), text(" explain RSA")]);
    const after = dropSkill(prefixed, "oculus-studio", chunksText(prefixed).length);
    expect(chunksText(after.chunks)).toBe("explain RSA");
    expect(after.caret).toBe("explain RSA".length);

    const trailing = normalize([text("explain RSA "), skill("oculus-studio")]);
    const trimmed = dropSkill(trailing, "oculus-studio", chunksText(trailing).length);
    expect(chunksText(trimmed.chunks)).toBe("explain RSA");
    expect(trimmed.caret).toBe("explain RSA".length);
  });

  test("insertAt and pasteAt split before a chip at its exact start and between adjacent chips", () => {
    const lead = insertAt([skill("oculus-studio")], 0, [att("./attachments/a.png")]);
    expect(lead.chunks.filter((c) => c.kind !== "text")).toEqual([
      att("./attachments/a.png"),
      skill("oculus-studio"),
    ]);
    expect(chunksText(lead.chunks)).toBe("`./attachments/a.png` /oculus-studio");

    const between = pasteAt(
      [skill("oculus-studio"), chip("courses/M/a.md")],
      "/oculus-studio".length,
      [att("./attachments/a.png")],
    );
    expect(between.chunks.filter((c) => c.kind !== "text")).toEqual([
      skill("oculus-studio"),
      att("./attachments/a.png"),
      chip("courses/M/a.md"),
    ]);
  });

  test("removeChipByOrdinal removes only the targeted chip and keeps single guards", () => {
    const three = normalize([skill("oculus-studio"), att("./attachments/a.png"), chip("courses/M/a.md")]);
    const mid = removeChipByOrdinal(three, 1)!;
    expect(mid.chunks).toEqual([
      text(ZWSP),
      skill("oculus-studio"),
      text(ZWSP),
      chip("courses/M/a.md"),
      text(ZWSP),
    ]);
    expect(mid.caret).toBe("/oculus-studio".length);

    const leadWithText = normalize([skill("oculus-studio"), text(" hello")]);
    const removed = removeChipByOrdinal(leadWithText, 0)!;
    expect(removed.chunks).toEqual([text(" hello")]);
    expect(removed.caret).toBe(0);
    expect(caretChunk(removed.chunks, removed.caret)).toEqual({ chunk: 0, offset: 0 });
    expect(equalChunks(removed.chunks, [text(" hello")])).toBe(true);
    expect(equalChunks(removed.chunks, [text(" world")])).toBe(false);
  });
});

describe("SkillPills active state", () => {
  test("renders Make a video as pressed and brand-tinted when active in the composer", () => {
    const prev = useSkillStore.getState().names;
    useSkillStore.setState({ names: new Set(["oculus-studio"]) });
    try {
      const inactive = renderToStaticMarkup(
        <TooltipProvider>
          <SkillPills active={[]} onToggle={() => {}} />
        </TooltipProvider>,
      );
      expect(inactive).toContain('aria-pressed="false"');
      expect(inactive).not.toContain("bg-brand-muted");

      const active = renderToStaticMarkup(
        <TooltipProvider>
          <SkillPills active={["oculus-studio"]} onToggle={() => {}} />
        </TooltipProvider>,
      );
      expect(active).toContain('aria-pressed="true"');
      expect(active).toContain("bg-brand-muted");
      expect(active).toContain("text-brand");
    } finally {
      useSkillStore.setState({ names: prev });
    }
  });

  test("Composer reserves a fixed-height top bar for skill pills and omits empty studio feedback", () => {
    const noop = () => {};
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <Composer
          draftKey="test:skill-swap"
          studioStyle
          skillPills
          provider="claude"
          model="opus"
          reasoning="high"
          subjects={[]}
          subjectId={null}
          running={false}
          usage={null}
          rateLimits={[]}
          onProvider={noop}
          onModel={noop}
          onReasoning={noop}
          onSend={noop}
          onStop={noop}
        />
      </TooltipProvider>,
    );
    expect(html).toContain("h-8 min-h-8");
    expect(html).toContain("flex-nowrap");
    expect(html).toContain("Make a video");
    expect(html.indexOf("Make a video")).toBeLessThan(html.indexOf('role="textbox"'));
    expect(html).not.toContain('aria-label="Video style"');
    expect(html).not.toContain("text-[12px] text-destructive");
    expect(skillsInText("/oculus-studio explain RSA", new Set(["oculus-studio"]))).toEqual(["oculus-studio"]);
    expect(skillsInText("plain text", new Set(["oculus-studio"]))).toEqual([]);
  });
});
