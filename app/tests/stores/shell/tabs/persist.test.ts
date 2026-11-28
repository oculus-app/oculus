import { afterEach, expect, test } from "bun:test";
import { restore } from "@/stores/shell/tabs/persist";

const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  if (previous) Object.defineProperty(globalThis, "localStorage", previous);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

test("a closed side item keeps its tab only while that tab is restored", () => {
  const raw = JSON.stringify({
    tabs: [{ id: 4, path: "/chat" }],
    activeId: 4,
    closed: [
      { index: 1, path: "/sync", url: null, side: null, beside: 4 },
      { index: 3, path: "/calendar", url: null, side: null, beside: 9 },
      { index: 1, path: null, url: "https://example.com", side: null, beside: "4" },
    ],
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => (key === "oculus-tabs" ? raw : null), setItem: () => {} },
  });
  expect(restore().closed.map((e) => e.beside)).toEqual([4, null, null]);
});
