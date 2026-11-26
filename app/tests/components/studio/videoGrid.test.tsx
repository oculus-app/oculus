import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { layoutGridItems, StudioGrid } from "@/components/studio/videos/StudioGrid";
import { VideoCard } from "@/components/studio/videos/VideoCard";
import { FolderCard } from "@/components/studio/videos/series/FolderCard";
import { PartCells } from "@/components/studio/videos/series/SeriesCells";
import { keepListedSeries } from "@/hooks/studio/useOpenSeries";
import { studioGridItems } from "@/lib/studio/series";
import { seriesPartCells } from "@/lib/studio/seriesGrid";
import { part, series, video } from "../../lib/studio/seriesFixtures";

const html = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (markup: string) => markup.replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'");

/** Shor's series as the mockup draws it: parts 1 and 2 made, 3 to 5 not. */
function shor(extra: Parameters<typeof series>[0] = {}) {
  const made = (n: number) => part(n, {
    slug: `shor-${n}`, exists: true, made: true,
    video: video(`shor-${n}`, { title: `Made ${n}`, series: "shor", part: n, scenes: 5, seconds: 100 + n }),
  });
  return series({
    slug: "shor", title: "How Shor's algorithm breaks RSA", subject: "COMP30026",
    parts: [made(1), made(2), part(3, { slug: "shor-3", title: "The quantum step" }), part(4, { slug: "shor-4" }), part(5, { slug: "shor-5" })],
    ...extra,
  });
}

test("every video card shows its length, and a part reads Part N where the subject would", () => {
  const single = text(html(<VideoCard video={video("eig", { title: "Eigen", subject: "MAST10007", scenes: 6, seconds: 96 })} />));
  expect(single).toContain("1:36");
  expect(single).toContain("MAST10007");
  expect(single).toContain("6 scenes");

  const asPart = text(html(<VideoCard video={video("p", { subject: "COMP30026", scenes: 5, seconds: 108 })} part={1} />));
  expect(asPart).toContain("Part 1 · 5 scenes");
  expect(asPart).toContain("1:48");
  expect(asPart).not.toContain("COMP30026");

  // No length until every scene has one.
  expect(html(<VideoCard video={video("q", { seconds: null })} />)).not.toContain("bg-black/70");
});

test("a closed folder counts its made parts and holds a slot per part", () => {
  const markup = html(<FolderCard series={shor()} open={false} onToggle={() => {}} />);
  expect(text(markup)).toContain("COMP30026 · 2/5 videos");
  expect(markup).toContain('aria-expanded="false"');
  expect(markup.match(/border-dashed border-input bg-card/g)?.length).toBe(3);
  expect(markup).not.toContain("data-tab-href");
});

test("an open folder stays first and its parts follow, with Make this part on the next part only", () => {
  const s = shor();
  const items = studioGridItems({ videos: [video("solo", { modified: 1 })], series: [s] });
  const markup = html(<StudioGrid items={items} open={new Set(["shor"])} onToggle={() => {}} />);
  const body = text(markup);
  expect(markup).toContain('aria-expanded="true"');
  expect(body.indexOf("How Shor's algorithm")).toBeLessThan(body.indexOf("Made 1"));
  expect(body.indexOf("Made 2")).toBeLessThan(body.indexOf("The quantum step"));
  expect(body).toContain("Part 1 · 5 scenes");
  expect(body).toContain("Part 3");
  expect(body).toContain("Part 5");
  expect(body.match(/Make this part/g)?.length).toBe(1);
  // On part 3's card, after its own button (title, then "Part 3").
  expect(body).toContain("The quantum stepPart 3Make this part");
  // Every part opens its own page, made or not.
  expect(markup).toContain('data-tab-href="/studio/videos/shor-3?n=The%20quantum%20step"');
  expect(markup).toContain('data-tab-href="/studio/videos/shor-1?n=Made%201"');
  // No button inside a button: the Make button follows the card's button.
  expect(markup).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s);
  expect(body).not.toContain("Not made");
});

const partCells = (s: ReturnType<typeof shor>, making: number[]) =>
  text(html(<PartCells series={s} edges={[]} make={{ making, make: () => {} }} />));

test("a part being made shows Making… in place of the button", () => {
  const body = partCells(shor(), [3]);
  expect(body).toContain("Making…");
  expect(body).not.toContain("Make this part");
});

test("a part not being made offers the button, folder or not", () => {
  const s = shor();
  s.parts[2] = { ...s.parts[2], exists: true, video: video("shor-3", { scenes: 2 }) };
  expect(partCells(s, [])).toContain("Make this part");
  expect(partCells(shor(), [])).toContain("Make this part");
});

test("two parts are made at once, and a later one leaves the next part's button", () => {
  const cells = seriesPartCells(shor(), [4, 5]);
  expect(cells.map((c) => c.kind === "empty" && c.offer)).toEqual([false, false, true, false, false]);
  expect(cells.map((c) => c.kind === "empty" && c.working)).toEqual([false, false, false, true, true]);
  expect(partCells(shor(), [3, 4]).match(/Making…/g)?.length).toBe(2);
});

test("layout counts an open folder's parts as cells and outlines only them", () => {
  const items = studioGridItems({
    videos: [video("a", { modified: 9 }), video("b", { modified: 1 })],
    series: [shor({ modified: 5 })],
  });
  const laid = layoutGridItems(items, new Set(["shor"]), 3);
  expect(laid.map((l) => l.open)).toEqual([false, true, false]);
  expect(laid[0].edges).toBeNull();
  expect(laid[2].edges).toBeNull();
  // Folder at index 1, five parts after it: the mockup's 1b.
  expect(laid[1].edges?.length).toBe(6);
  expect(laid[1].edges?.[0]).toMatchObject({ top: true, left: true, right: false, bottom: false });
  expect(laid[1].edges?.[5]).toMatchObject({ top: false, left: true, right: true, bottom: true });

  const closed = layoutGridItems(items, new Set(), 3);
  expect(closed.every((l) => l.edges == null)).toBe(true);
});

test("a folder whose series leaves the list is forgotten", () => {
  const kept = new Set(["shor"]);
  expect(keepListedSeries(kept, [shor()])).toBe(kept);
  expect([...keepListedSeries(new Set(["shor", "gone"]), [shor()])]).toEqual(["shor"]);
});
