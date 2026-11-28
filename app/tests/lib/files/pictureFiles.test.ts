import { afterAll, beforeAll, expect, test } from "bun:test";
import { parseHTML } from "linkedom";

import type { DbFile } from "@/lib/db";
import { isPictureFile } from "@/lib/files/fileTypes";

let filePageHref: typeof import("@/lib/files/openFile").filePageHref;
const previous = Object.getOwnPropertyDescriptors(globalThis);

beforeAll(async () => {
  // `openFile` reaches stores that read the window as they load.
  const dom = parseHTML("<html><body></body></html>");
  Object.assign(globalThis, { window: dom.window, document: dom.document });
  ({ filePageHref } = await import("@/lib/files/openFile"));
});

afterAll(() => {
  for (const key of ["window", "document"]) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const row = (relative_path: string, category: string) =>
  ({ id: 1, subject_id: 3, filename: relative_path.split("/").pop()!, relative_path, category }) as DbFile;

test("a picture opens on its file page, an SVG among them, the student's or synced", () => {
  for (const [path, category] of [
    ["courses/COMP30026/Diagrams/dfa.svg", "upload"],
    ["courses/COMP30026/Diagrams/plot.PNG", "upload"],
    ["courses/COMP30026/Course/Files/figure.svg", "file"],
  ]) {
    expect(isPictureFile(path)).toBe(true);
    expect(filePageHref(row(path, category))).toBe(`/subjects/3/file?path=${encodeURIComponent(path)}`);
  }
});

test("a synced binary with no viewer, an HTML page among them, goes to the system viewer", () => {
  for (const path of ["courses/COMP30026/Course/Files/notes.zip", "courses/COMP30026/Course/Files/page.html"]) {
    expect(isPictureFile(path)).toBe(false);
    expect(filePageHref(row(path, "file"))).toBeNull();
  }
});
