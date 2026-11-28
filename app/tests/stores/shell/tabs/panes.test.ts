import { expect, test } from "bun:test";
import { browsePath } from "@/lib/browser";
import { keyboardSide, pane, type AppTab, type PaneSide } from "@/stores/shell/tabs/panes";

const tab = (main: string, side: string | null, focus: PaneSide, hidden = false): AppTab => ({
  ...pane(1, main),
  focus,
  side: side == null ? null : { items: [{ ...pane(2, side), viewed: 1 }], front: 2, ratio: 0.5, hidden },
});
const web = browsePath(7);

test("the keyboard is where the tab's focus says while the app's document has it", () => {
  expect(keyboardSide(tab("/chat", "/notes", "side"), true)).toBe("side");
  expect(keyboardSide(tab("/chat", web, "main"), true)).toBe("main");
});

test("no side panel on show means the main pane", () => {
  expect(keyboardSide(tab("/chat", null, "main"), true)).toBe("main");
  expect(keyboardSide(tab("/chat", "/notes", "side", true), true)).toBe("main");
});

test("a lone browser page has the keyboard once the document has lost it", () => {
  expect(keyboardSide(tab("/chat", web, "main"), false)).toBe("side");
  expect(keyboardSide(tab(web, "/notes", "side"), false)).toBe("main");
});

test("two browser pages, or none, leave it to the tab's focus", () => {
  expect(keyboardSide(tab(web, browsePath(8), "side"), false)).toBe("side");
  expect(keyboardSide(tab("/chat", "/notes", "main"), false)).toBe("main");
});
