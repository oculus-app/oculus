import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// Opening a saved copy reaches the viewers, which need a page; a render needs none.
mock.module("@/lib/files/openFile", () => ({ openCitation: () => {} }));

const { SaveControl, saveWords } = await import("@/components/harness/save/SaveToDriveAction");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const PATH = ".oculus/agents/outputs/dfa.svg";
const STAMP = { size: 6, modifiedMs: 1000 };
const FAILED = { stamp: STAMP, saved: null, saving: false, failed: "The disk is full." };

const render = () =>
  renderToStaticMarkup(
    <TooltipProvider>
      <SaveControl path={PATH} look="caption" state={FAILED} subjectId={null} />
    </TooltipProvider>,
  );

describe("SaveToDriveAction after a failed save", () => {
  test("still offers the save, in its normal look", () => {
    const html = render();
    expect(html).toContain('aria-label="Save to Drive…"');
    expect(html).toContain("text-muted-foreground");
    expect(html).not.toContain("text-destructive");
    expect(html).not.toContain("Not saved");
  });

  test("keeps the reason as its tooltip", () => {
    expect(saveWords(FAILED, "caption")).toEqual({ label: "Save to Drive…", tip: "The disk is full." });
    expect(saveWords({ ...FAILED, failed: undefined }, "caption")).toEqual({ label: "Save to Drive…", tip: null });
    expect(saveWords({ ...FAILED, failed: undefined }, "icon").tip).toBe("Save to Drive…");
  });

  test("a save after it reads as saving, then as the copy", () => {
    expect(saveWords({ ...FAILED, saving: true }, "row").label).toBe("Saving…");
    const saved = { stamp: STAMP, saved: { fileId: 1, relativePath: "Diagrams/dfa.svg" } };
    expect(saveWords(saved, "row")).toEqual({ label: "Open in Drive", tip: null });
  });
});
