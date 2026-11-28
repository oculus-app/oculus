import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewLine } from "@/components/harness/threads/PreviewLine";
import { useSkillStore } from "@/stores/chat/skillStore";

// A server render reads a zustand store's initial state.
const initial = useSkillStore.getInitialState();
const initialNames = initial.names;
initial.names = new Set(["oculus-studio", "oculus-plan"]);
afterAll(() => {
  initial.names = initialNames;
});

const render = (text: string) => renderToStaticMarkup(<PreviewLine text={text} />);

describe("PreviewLine", () => {
  test("a picked skill and a mention draw as chips, never as the text on the wire", () => {
    const html = render("/oculus-studio `COMP30026_cheatsheet.pdf` for week 7");
    expect(html).toContain('data-skill="oculus-studio"');
    expect(html).toContain("make a video");
    expect(html).not.toContain("/oculus-studio");
    expect(html).toContain("COMP30026_cheatsheet.pdf</span>");
    expect(html).not.toContain("`");
    expect(html).toContain(" for week 7");
  });

  test("a /word the catalogue does not hold stays text", () => {
    const html = render("try /usr/bin or /nothing");
    expect(html).toBe("try /usr/bin or /nothing");
  });

  test("an attachment draws as its kind when this install never named it", () => {
    const html = render("look at `./attachments/a1.png`");
    expect(html).toContain("Picture</span>");
    expect(html).not.toContain("attachments/a1.png");
  });

  test("a markdown link reads as its words", () => {
    expect(render("see [the spec](https://example.com/spec) now")).toBe("see the spec now");
  });
});
