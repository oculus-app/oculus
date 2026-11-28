import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionMd } from "@/components/harness/timeline/QuestionMd";
import { remarkLineBreaks, remarkSkills } from "@/components/harness/timeline/questionRemark";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSkillStore } from "@/stores/chat/skillStore";

// A server render reads a zustand store's initial state.
const initial = useSkillStore.getInitialState();
const initialNames = initial.names;
initial.names = new Set(["oculus-studio"]);
afterAll(() => {
  initial.names = initialNames;
});

const render = (text: string) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <QuestionMd text={text} onPicture={() => {}} />
    </TooltipProvider>,
  );

const text = (value: string) => ({ type: "text", value });
const paragraph = (...children: object[]) => ({ type: "root", children: [{ type: "paragraph", children }] });

describe("remarkSkills", () => {
  test("only a /name the catalogue holds becomes a chip, and never inside code", () => {
    const tree = paragraph(text("/oculus-studio then /nothing"), { type: "inlineCode", value: "/oculus-studio" });
    remarkSkills(new Set(["oculus-studio"]))(tree);
    expect(tree.children[0].children).toEqual([
      { type: "skill", data: { hName: "skill-chip", hProperties: { name: "oculus-studio" } } },
      text(" then /nothing"),
      { type: "inlineCode", value: "/oculus-studio" },
    ]);
  });
});

describe("remarkLineBreaks", () => {
  test("a typed line break is a break, not a space", () => {
    const tree = paragraph(text("one\ntwo\n"));
    remarkLineBreaks()(tree);
    expect(tree.children[0].children).toEqual([text("one"), { type: "break" }, text("two"), { type: "break" }]);
  });
});

describe("QuestionMd", () => {
  test("markdown draws, with the composer's chips where the message names them", () => {
    const html = render("/oculus-studio **bold** and `x + y`\nsecond line\n\n- one\n- two `COMP30026_cheatsheet.pdf`");
    expect(html).toContain('data-skill="oculus-studio"');
    expect(html).not.toContain("/oculus-studio");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toMatch(/<code[^>]*>x \+ y<\/code>/);
    expect(html).toMatch(/<br\/?>\s*second line/);
    expect(html).toContain("<li");
    expect(html).toContain('data-path="COMP30026_cheatsheet.pdf"');
  });

  test("a fence is only code: no diagram or widget is drawn from a sent message", () => {
    const html = render("```mermaid\ngraph TD; A-->B\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("graph TD");
    expect(html).not.toContain("data-md");
  });

  test("typed HTML reads as text", () => {
    expect(render("use <b>this</b>")).toContain("&lt;b&gt;this&lt;/b&gt;");
  });

  test("a bare web link is a link chip", () => {
    const html = render("see https://example.com/spec now");
    expect(html).toContain('role="link"');
    expect(html).toContain("example.com");
  });
});
