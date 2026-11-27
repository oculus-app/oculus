import { afterAll, afterEach, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { clearMocks, mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import type { HarnessItem, ToolMeta } from "@/lib/harness/types";
import { fullCitation } from "@/lib/citations/parse";
import * as dataDir from "@/hooks/backend/useDataDir";
import { readPicturePath } from "@/components/harness/timeline/readPicture";

const dir = "/fixture/Application Support/com.tchan.oculus";
const dom = parseHTML("<html><body></body></html>");
const probes: string[] = [];
const globals = {
  window: dom.window,
  document: dom.document,
  ResizeObserver: class { observe() {} disconnect() {} },
  Image: class { set src(value: string) { probes.push(value); } },
  IS_REACT_ACT_ENVIRONMENT: true,
};
const previous = Object.getOwnPropertyDescriptors(globalThis);
let ToolRow: typeof import("@/components/harness/timeline/WorkRow").ToolRow;
let MD_COMPONENTS: typeof import("@/components/markdown/MdComponents").MD_COMPONENTS;
let createRoot: typeof import("react-dom/client").createRoot;
let root: Root;
let host: HTMLDivElement;
let directory: { mockRestore(): void };

beforeAll(async () => {
  Object.assign(globalThis, globals);
  directory = spyOn(dataDir, "useDataDir").mockReturnValue(dir);
  mockConvertFileSrc("macos");
  ({ createRoot } = await import("react-dom/client"));
  ({ ToolRow } = await import("@/components/harness/timeline/WorkRow"));
  ({ MD_COMPONENTS } = await import("@/components/markdown/MdComponents"));
});

beforeEach(() => {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

afterAll(() => {
  directory.mockRestore();
  clearMocks();
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function tool(content: string, meta: ToolMeta): HarnessItem {
  return { id: 1, thread_id: 1, kind: "tool", ref_id: null, content, meta: JSON.stringify(meta), created_at: "" };
}

for (const folder of [".oculus/whiteboard-pages", "whiteboard-pages", "canvas-pages"]) {
  test(`a Read in ${folder} opens the page asset and falls back to its original arguments on error`, async () => {
    const path = `${dir}/${folder}/7/page-004.png`;
    const asset = "asset://localhost/" + encodeURIComponent(`${dir}/.oculus/whiteboard-pages/7/page-004.png`);
    const item = tool("page-004.png", { kind: "read", name: "Read", input: { file_path: path }, ok: true });
    await act(() => root.render(<ToolRow item={item} />));
    await act(() => host.querySelector("button")!.click());
    const img = host.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(asset);
    await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Open the picture"]')!.click());
    expect(probes.pop()).toBe(asset);
    await act(() => { img.dispatchEvent(new dom.window.Event("error")); });
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain(`file_path: ${path}`);
  });
}

test("the asset scope grants the notebook snapshot subtree where it is, not the state folder", async () => {
  const config = await Bun.file(new URL("../../../src-tauri/tauri.conf.json", import.meta.url)).json();
  const allow = config.app.security.assetProtocol.scope.allow;
  expect(allow).toContain("$APPDATA/.oculus/whiteboard-pages/**");
  expect(allow).not.toContain("$APPDATA/**");
  expect(allow).not.toContain("$APPDATA/.oculus/**");
  expect(allow).not.toContain("$APPDATA/whiteboard-pages/**");
  expect(allow).not.toContain("$APPDATA/canvas-pages/**");
});

test("every spelling of a notebook page is remapped to the snapshot subtree", () => {
  const page = dir + "/.oculus/whiteboard-pages/7/page-004.png";
  for (const raw of [
    ".oculus/whiteboard-pages/7/page-004.png",
    "whiteboard-pages/7/page-004.png",
    "../whiteboard-pages/7/page-004.png",
    "canvas-pages/7/page-004.png",
    "../canvas-pages/7/page-004.png",
  ]) {
    expect(readPicturePath(raw, dir)).toBe(page);
  }
  const own = dir + "/.oculus/agents/outputs/canvas-pages/a.png";
  expect(readPicturePath(own, dir)).toBe(own);
  expect(readPicturePath("canvas-pages/../private/a.png", dir)).toBeNull();
  expect(readPicturePath("../../whiteboard-pages/7/page-004.png", dir)).toBe(page);
  expect(readPicturePath("../../../whiteboard-pages/7/page-004.png", dir)).toBeNull();
  expect(readPicturePath("unrecorded/a.png", dir)).toBeNull();
  expect(readPicturePath("agents/outputs/a.png", dir)).toBeNull();
});

test("a picture up from the cwd is the data dir's, two steps from the workspace or one in older chats", () => {
  for (const raw of ["../../courses/X/Course/Images/a.png", "../courses/X/Course/Images/a.png"]) {
    expect(readPicturePath(raw, dir)).toBe(dir + "/courses/X/Course/Images/a.png");
  }
  expect(readPicturePath("../../Receipts/scan.png", dir)).toBe(dir + "/Receipts/scan.png");
  expect(readPicturePath("../agents/outputs/plot.png", dir)).toBe(dir + "/.oculus/agents/outputs/plot.png");
  expect(readPicturePath("../../courses/../../etc/a.png", dir)).toBeNull();
});

test("a picture a stored Read names under the data dir loads from where the file is", () => {
  expect(readPicturePath(dir + "/agents/outputs/plot.png", dir)).toBe(dir + "/.oculus/agents/outputs/plot.png");
  expect(readPicturePath(dir + "/agents/attachments/a.jpg", dir)).toBe(dir + "/.oculus/agents/attachments/a.jpg");
  expect(readPicturePath(dir + "/studio/videos/x/frames/1.png", dir)).toBe(dir + "/.oculus/studio/videos/x/frames/1.png");
  const course = dir + "/courses/X/Course/Images/a.png";
  expect(readPicturePath(course, dir)).toBe(course);
  expect(readPicturePath("/tmp/agents/a.png", dir)).toBe("/tmp/agents/a.png");
  expect(readPicturePath(dir + "/agents/../oculus.png", dir)).toBeNull();
});

test("Codex rows use the translated title for the command and CLI wording", async () => {
  for (const [kind, title, label] of [
    ["bash", "ls -a", "ls -a"],
    ["oculus_cli", 'oculus read "my page.pdf"', "Read"],
  ] as const) {
    const command = "/bin/zsh -lc '" + title + "'";
    const item = tool(title, { kind, name: "commandExecution", input: { command }, ok: true });
    await act(() => root.render(<ToolRow key={kind} item={item} />));
    expect(host.textContent).toContain(label);
    expect(host.textContent).not.toContain("/bin/zsh");
    if (kind === "oculus_cli") {
      expect(host.textContent).toContain("my page.pdf");
      await act(() => host.querySelector("button")!.click());
      expect(host.textContent).toContain(title);
    }
  }
});

test("reply SVGs use the disk path and carry the cache buster on the asset URL", async () => {
  for (const [target, file, suffix] of [
    ["outputs/x.svg", "x.svg", ""],
    ["./outputs/x.svg", "x.svg", ""],
    ["agents/outputs/x.svg", "x.svg", ""],
    [".oculus/agents/outputs/x.svg", "x.svg", ""],
    ["outputs/x.svg?v=2", "x.svg", "?v=2"],
    ["<outputs/my plot.svg?v=3>", "my plot.svg", "?v=3"],
  ]) {
    await act(() => root.render(<ReactMarkdown components={MD_COMPONENTS}>{`![plot](${target})`}</ReactMarkdown>));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "asset://localhost/" + encodeURIComponent(`${dir}/.oculus/agents/outputs/${file}`) + suffix,
    );
  }
});

test("local markdown refuses traversal and preserves citation locations", async () => {
  for (const target of ["outputs/../x.svg", "./outputs/%2e%2e/x.svg", "./outputs/a%5c../x.svg", "/outside/x.svg"]) {
    await act(() => root.render(<ReactMarkdown components={MD_COMPONENTS}>{`![plot](${target})`}</ReactMarkdown>));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("plot");
  }
  expect(fullCitation("../courses/X/notes.pdf?v=2#page=4")).toMatchObject({ path: "courses/X/notes.pdf", page: 4 });
  expect(fullCitation("courses/X/lecture.mp4?v=2#t=0")).toMatchObject({ path: "courses/X/lecture.mp4", at: 0 });
  expect(fullCitation("courses/X/Files/C#-intro.pdf")).toMatchObject({ path: "courses/X/Files/C#-intro.pdf" });
  expect(fullCitation("agents/outputs/what?.md")).toMatchObject({ path: ".oculus/agents/outputs/what?.md" });
});

test("a stored Codex row with its shell wrapper shows the inner command", async () => {
  const raw = "/bin/zsh -lc 'cat AGENTS.md'";
  const meta: ToolMeta = { kind: "bash", name: "commandExecution", input: { command: raw }, ok: true };
  await act(() => root.render(<ToolRow item={tool(raw, meta)} running={false} />));
  expect(host.textContent).toContain("cat AGENTS.md");
  expect(host.textContent).not.toContain("/bin/zsh");
});

test("an old oculus row the wording table cannot read still shows that it failed", async () => {
  const title = "/bin/zsh -lc 'oculus task add x'";
  const meta: ToolMeta = { kind: "oculus_cli", name: "commandExecution", input: { command: title }, ok: false };
  await act(() => root.render(<ToolRow item={tool(title, meta)} running={false} />));
  expect(host.textContent).toContain("failed");
});

test("a wrapped CLI call keeps its icon while its verb moves from live to failed or stopped", async () => {
  const title = "oculus quiz add --prompt Test -s CS";
  const meta: ToolMeta = { kind: "oculus_cli", name: "commandExecution", input: { command: "sh -lc '" + title + "'" } };
  await act(() => root.render(<ToolRow item={tool(title, meta)} />));
  const icon = host.querySelector("svg")!.innerHTML;
  expect(host.querySelector(".text-shimmer")?.textContent).toBe("Drafting a question");
  expect(host.querySelector(".animate-spin")).toBeNull();
  for (const [ok, label] of [[true, "Drafted a question"], [false, "Command failed"], [null, "Command stopped"]] as const) {
    await act(() => root.render(<ToolRow item={tool(title, { ...meta, ok })} running={false} />));
    expect(host.querySelector("svg")!.innerHTML).toBe(icon);
    expect(host.textContent).toContain(label);
    expect(host.querySelector(".text-shimmer, .animate-spin")).toBeNull();
  }
});
