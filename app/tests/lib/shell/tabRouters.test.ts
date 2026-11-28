import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createMemoryRouter, type DataRouter } from "react-router-dom";
import { browser, browsePath, type BrowserTab } from "@/lib/browser";
import { useBrowserStore } from "@/stores/shell/browserStore";
import { pane } from "@/stores/shell/tabs/panes";


// Playback installs a pagehide listener when the shell is imported, and
// CodeMirror reads `document.documentElement.style`. Earlier files may leave a
// bare `window` or `document` behind, so this file always installs its own.
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", {
  configurable: true, value: { addEventListener() {}, documentElement: { style: {} } },
});
Object.defineProperty(globalThis, "window", {
  configurable: true, value: { addEventListener() {}, setTimeout, clearTimeout },
});
const { dropTabRouter, expandSide, openLink, openUrlInFocusedPane, pageKey, routerFor } = await import("@/lib/shell/tabRouters");
const { sideFront, useTabStore } = await import("@/stores/shell/tabStore");
const originalState = useTabStore.getState();
afterAll(() => {
  useTabStore.setState(originalState);
  if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

const parentId = 1000;
const sideId = 1001;
const neighbourId = 1002;
const pageId = 41;
const url = "https://example.com";
let router: DataRouter;
let finishLazy: () => void;
let lazyStarted: Promise<void>;
let nativeOpen: ReturnType<typeof spyOn<typeof browser, "open">>;

beforeEach(() => {
  useTabStore.setState({
    tabs: [
      { ...pane(parentId, "/document"), focus: "side", side: {
        items: [{ ...pane(sideId, "/new"), viewed: 1 }], front: sideId, ratio: 0.5,
      } },
      { ...pane(neighbourId, "/new"), focus: "main", side: null },
    ], activeId: parentId, closed: [],
  });
  let markStarted: () => void;
  lazyStarted = new Promise<void>((resolve) => { markStarted = resolve; });
  const lazy = new Promise<void>((resolve) => { finishLazy = resolve; });
  router = routerFor(sideId, () => createMemoryRouter([
    { path: "/new", Component: () => null },
    { path: "/browse/:id", lazy: async () => {
      markStarted();
      await lazy;
      return { Component: () => null };
    } },
  ], { initialEntries: ["/new"] }));
  nativeOpen = spyOn(browser, "open");
});

afterEach(async () => {
  finishLazy();
  // Drain the lazy navigation before releasing its store subscription.
  for (let i = 0; i < 20 && router.state.navigation.state !== "idle"; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  nativeOpen.mockRestore();
  for (const tab of useTabStore.getState().tabs) dropTabRouter(tab.id);
  dropTabRouter(sideId);
  router.dispose();
});

function snapshotBeforeReply() {
  nativeOpen.mockImplementation(async () => {
    // Rust broadcasts a new page before browser.open resolves; the shell
    // adopts an unclaimed page in a strip tab and activates it.
    useTabStore.getState().addTab(browsePath(pageId));
    return pageId;
  });
}

describe("opening a browser in the side panel", () => {
  test("claims the page while its first lazy route is still loading", async () => {
    nativeOpen.mockResolvedValue(pageId);
    await openUrlInFocusedPane(url);
    await lazyStarted;
    expect(router.state.location.pathname).toBe("/new");
    expect(router.state.navigation.location?.pathname).toBe(browsePath(pageId));
    const parent = useTabStore.getState().tabs.find((t) => t.id === parentId)!;
    expect(sideFront(parent)?.path).toBe(browsePath(pageId));
    expect(useTabStore.getState().activeId).toBe(parentId);
  });

  test("removing an early strip tab returns focus to its owning tab", async () => {
    snapshotBeforeReply();
    await openUrlInFocusedPane(url);
    await lazyStarted;
    const state = useTabStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual([parentId, neighbourId]);
    expect(state.activeId).toBe(parentId);
    expect(state.tabs[0].focus).toBe("side");
    expect(sideFront(state.tabs[0])?.path).toBe(browsePath(pageId));
  });

  test("cleanup preserves a different tab selected while the native page opens", async () => {
    nativeOpen.mockImplementation(async () => {
      useTabStore.getState().addTab(browsePath(pageId));
      useTabStore.getState().setActive(neighbourId);
      return pageId;
    });
    await openUrlInFocusedPane(url);
    expect(useTabStore.getState().activeId).toBe(neighbourId);
  });

  test("a plain web link keeps the source tab when the snapshot arrives first", async () => {
    snapshotBeforeReply();
    await openLink(url);
    const state = useTabStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual([parentId, neighbourId]);
    expect(state.activeId).toBe(parentId);
    expect(sideFront(state.tabs[0])?.path).toBe(browsePath(pageId));
  });

  test("an explicit new-tab link keeps its native strip tab", async () => {
    snapshotBeforeReply();
    await openLink(url, true);
    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(3);
    expect(state.tabs.find((t) => t.id === state.activeId)?.path).toBe(browsePath(pageId));
    expect(sideFront(state.tabs[0])?.path).toBe("/new");
  });
});

describe("expanding a side item", () => {
  const mainId = 2000;
  const itemId = 2001;
  const file = (n: number) => `/subjects/1/file?path=${n}.pdf`;
  const built: DataRouter[] = [];

  /** A router that went `from` → `to`, as a mounted pane's would have. */
  async function mount(id: number, from: string, to: string): Promise<DataRouter> {
    const made = routerFor(id, () => createMemoryRouter(
      [{ path: "*", Component: () => null }], { initialEntries: [from] },
    ));
    built.push(made);
    await made.navigate(to);
    return made;
  }
  /** A tab in front on `mainPath`, with `sidePaths` beside it, the first in
   *  front and mounted, as the main pane is. */
  async function open(mainPath: string, sidePaths: string[]) {
    const items = sidePaths.map((path, i) => ({
      ...pane(itemId + i, i === 0 ? "/side-start" : path), viewed: sidePaths.length - i,
    }));
    useTabStore.setState({
      tabs: [{ ...pane(mainId, "/start"), focus: "side", side: {
        items, front: itemId, ratio: 0.6,
      } }],
      activeId: mainId, closed: [],
    });
    return {
      main: await mount(mainId, "/start", mainPath),
      item: await mount(itemId, "/side-start", sidePaths[0]),
    };
  }
  const tab = () => useTabStore.getState().tabs.find((t) => t.id === mainId)!;
  const at = (r: DataRouter) => r.state.location.pathname + r.state.location.search;
  afterEach(() => {
    dropTabRouter(itemId);
    for (const made of built.splice(0)) made.dispose();
  });

  test("the item and the main page trade places and the panel hides", async () => {
    const { main, item } = await open("/chat/7", [file(1), file(2)]);
    expect([pageKey(mainId), pageKey(itemId)]).toEqual([mainId, itemId]);
    expandSide(mainId, false);
    expect(tab()).toMatchObject({ path: file(1), canBack: true, focus: "main" });
    expect(tab().side).toMatchObject({ hidden: true, ratio: 0.6, front: itemId });
    expect(tab().side?.items.map((i) => i.path)).toEqual(["/chat/7", file(2)]);
    // Neither page navigated: each kept its router, and so its mount.
    expect([at(main), at(item)]).toEqual(["/chat/7", file(1)]);
    expect([pageKey(mainId), pageKey(itemId)]).toEqual([itemId, mainId]);
    expect(routerFor(mainId, () => main)).toBe(item);
  });

  test("each page reports as the pane it moved to, with its own history", async () => {
    const { main, item } = await open("/chat/7", [file(1)]);
    expandSide(mainId, false);
    await item.navigate(-1);
    expect(tab()).toMatchObject({ path: "/side-start", canBack: false, canForward: true });
    await main.navigate("/chat/8");
    expect(sideFront(tab())).toMatchObject({ path: "/chat/8", canBack: true });
  });

  test("expanding the page that was swapped out puts both back", async () => {
    const { main } = await open("/chat/7", [file(1)]);
    expandSide(mainId, false);
    useTabStore.getState().toggleSide(mainId);
    expandSide(mainId, false);
    expect(tab().path).toBe("/chat/7");
    expect(tab().side?.items.map((i) => i.path)).toEqual([file(1)]);
    expect([pageKey(mainId), pageKey(itemId)]).toEqual([mainId, itemId]);
    expect(routerFor(mainId, () => main)).toBe(main);
  });

  test("a new-tab page is not kept: the panel closes", async () => {
    const { item } = await open("/new", [file(1)]);
    expandSide(mainId, false);
    expect(tab().path).toBe(file(1));
    expect(tab().side).toBeNull();
    expect(routerFor(mainId, () => item)).toBe(item);
    expect(pageKey(itemId)).toBe(itemId);
  });

  test("⌘-click opens a tab of its own and leaves the page and the panel", async () => {
    const { main } = await open("/chat/7", [file(1), file(2)]);
    expandSide(mainId, true);
    const { tabs, activeId } = useTabStore.getState();
    expect(tabs.find((t) => t.id === activeId)?.path).toBe(file(1));
    expect(at(main)).toBe("/chat/7");
    expect(tab().path).toBe("/chat/7");
    expect(tab().side?.hidden).toBeUndefined();
    expect(tab().side?.items.map((i) => i.path)).toEqual([file(2)]);
  });
});

describe("closing a side item and reopening it", () => {
  const hostId = 3000;
  const noteId = 3001;
  const otherId = 3002;
  const note = "/subjects/1/file?path=note.md";
  let nativeClose: ReturnType<typeof spyOn<typeof browser, "close">>;

  function open(sidePath: string) {
    useTabStore.setState({
      tabs: [
        { ...pane(hostId, "/chat/7"), focus: "side", side: {
          items: [{ ...pane(noteId, sidePath), viewed: 1 }], front: noteId, ratio: 0.5,
        } },
        { ...pane(otherId, "/calendar"), focus: "main", side: null },
      ],
      activeId: hostId, closed: [],
    });
  }
  const host = () => useTabStore.getState().tabs.find((t) => t.id === hostId);
  beforeEach(() => {
    nativeClose = spyOn(browser, "close").mockResolvedValue(undefined);
  });
  afterEach(() => {
    nativeClose.mockRestore();
    useBrowserStore.setState({ tabs: [], loaded: false });
  });

  test("the item leaves alone and ⇧⌘T puts it back beside its tab", () => {
    open(note);
    useTabStore.getState().closeSide(hostId, noteId);
    expect(host()).toMatchObject({ path: "/chat/7", side: null, focus: "main" });
    useTabStore.getState().setActive(otherId);
    useTabStore.getState().reopenTab();
    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeId).toBe(hostId);
    expect(host()?.focus).toBe("side");
    expect(sideFront(host()!)?.path).toBe(note);
    expect(state.closed).toEqual([]);
  });

  test("it reopens as a tab after its own once that tab has gone", () => {
    open(note);
    useTabStore.getState().closeSide(hostId, noteId);
    useTabStore.setState((s) => ({
      tabs: s.tabs.filter((t) => t.id !== hostId), activeId: otherId,
    }));
    useTabStore.getState().reopenTab();
    const state = useTabStore.getState();
    expect(state.tabs.map((t) => t.path)).toEqual(["/calendar", note]);
    expect(state.tabs.find((t) => t.id === state.activeId)?.path).toBe(note);
  });

  test("an empty new-tab page is not remembered", () => {
    open("/new");
    useTabStore.getState().closeSide(hostId, noteId);
    expect(host()?.side).toBeNull();
    expect(useTabStore.getState().closed).toEqual([]);
  });

  test("a browser page is remembered by its address and reopens beside", async () => {
    open(browsePath(pageId));
    useBrowserStore.setState({ tabs: [{ id: pageId, url } as BrowserTab], loaded: true });
    useTabStore.getState().closeSide(hostId, noteId);
    expect(nativeClose).toHaveBeenCalledWith(pageId);
    expect(useTabStore.getState().closed).toMatchObject([{ path: null, url, beside: hostId }]);
    nativeOpen.mockResolvedValue(pageId + 1);
    useTabStore.getState().reopenTab();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(nativeOpen).toHaveBeenCalledWith(url);
    expect(useTabStore.getState().tabs).toHaveLength(2);
    expect(sideFront(host()!)?.path).toBe(browsePath(pageId + 1));
  });
});
