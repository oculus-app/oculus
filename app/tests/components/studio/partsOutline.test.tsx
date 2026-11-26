import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PartsOutline } from "@/components/studio/series/PartsOutline";
import { subjectCodeFor } from "@/lib/studio/subjectCode";
import { part, series, video } from "../../lib/studio/seriesFixtures";

const shor = series({
  parts: [
    part(1, { title: "The lock RSA uses", exists: true, made: true, video: video("part-1", { seconds: 108 }) }),
    part(2, { title: "Period finding", exists: true, made: true, video: video("part-2", { seconds: 102 }) }),
    part(3, { title: "The quantum step", question: "How does a quantum computer find a period?" }),
    part(4),
    part(5),
  ],
});

const draw = (props: Partial<Parameters<typeof PartsOutline>[0]> = {}) =>
  renderToStaticMarkup(
    <PartsOutline
      series={shor}
      current={2}
      currentLabel="Watching"
      making={[]}
      onMake={() => {}}
      action={(p) => ({ label: `Open part ${p.number}`, onClick: () => {} })}
      {...props}
    />,
  );

describe("PartsOutline", () => {
  test("counts made parts and lists every part with its question", () => {
    const html = draw();
    expect(html).toContain("tabular-nums\">2/5</span>");
    expect(html).toContain("How does a quantum computer find a period?");
    expect(html.match(/<li/g)).toHaveLength(5);
  });
  test("a made part shows its length, the lit one says what it is doing", () => {
    const html = draw();
    expect(html).toContain("1:48");
    expect(html).toContain("Watching");
    expect(html.match(/Watching/g)).toHaveLength(1);
  });
  test("one Make this part, on the next part not made, and no row says not made", () => {
    const html = draw();
    expect(html.match(/Make this part/g)).toHaveLength(1);
    expect(html).not.toMatch(/not made/i);
  });
  test("the next part being made says so and offers nothing", () => {
    const html = draw({ making: [3] });
    expect(html).toContain("Making…");
    expect(html).not.toContain("Make this part");
  });
  test("several parts can be made at once, and a later one leaves the next part's button", () => {
    expect(draw({ making: [3, 4] }).match(/Making…/g)).toHaveLength(2);
    const later = draw({ making: [4] });
    expect(later.match(/Making…/g)).toHaveLength(1);
    expect(later.match(/Make this part/g)).toHaveLength(1);
  });
  test("a row without an action is not a button", () => {
    const html = draw({ action: (p) => (p.made ? { label: `Play part ${p.number}`, onClick: () => {} } : null) });
    expect(html.match(/aria-label="Play part/g)).toHaveLength(2);
  });
});

describe("subjectCodeFor", () => {
  const subjects = [
    { code: "COMP30026_2025_SM2", is_current: false },
    { code: "COMP30026_2026_SM2", is_current: true },
  ];
  test("a course code names its current term's subject", () => {
    expect(subjectCodeFor(subjects, "COMP30026")).toBe("COMP30026_2026_SM2");
  });
  test("an unknown course keeps its own code", () => {
    expect(subjectCodeFor(subjects, "MAST10007")).toBe("MAST10007");
  });
});
