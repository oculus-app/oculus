import { RUNTIME } from "./allow";

/**
 * Makes `live`'s children match `next`'s while keeping every node that is
 * still the same kind at the same place, so a streamed prefix only appends
 * and patches: focus, pointer capture, selection, hover and running
 * transitions stay with their nodes. Runtime-owned attributes (`RUNTIME`)
 * are never reset. A formula (`data-tex`) and a chart host (`data-chart`,
 * whose children React owns) are compared by their attributes alone.
 */
export function morph(live: Node, next: Node): void {
  const want = Array.from(next.childNodes);
  for (let i = 0; i < want.length; i++) {
    const n = want[i];
    const l = live.childNodes[i];
    if (!l) {
      live.appendChild(n);
    } else if (!same(l, n)) {
      live.replaceChild(n, l);
    } else if (l.nodeType === Node.TEXT_NODE) {
      if ((l as Text).data !== (n as Text).data) {
        (l as Text).data = (n as Text).data;
      }
    } else if (l.nodeType === Node.ELEMENT_NODE) {
      const le = l as Element;
      const ne = n as Element;
      if (le.hasAttribute("data-tex")) {
        if (le.getAttribute("data-tex") !== ne.getAttribute("data-tex") || le.className !== ne.className) {
          live.replaceChild(n, l);
        }
        continue;
      }
      syncAttrs(le, ne);
      if (!le.hasAttribute("data-chart")) morph(le, ne);
    }
  }
  while (live.childNodes.length > want.length) {
    live.removeChild(live.lastChild!);
  }
}

const same = (a: Node, b: Node) =>
  a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a as Element).namespaceURI === (b as Element).namespaceURI;

function syncAttrs(l: Element, n: Element): void {
  for (const a of Array.from(n.attributes)) {
    if (l.getAttribute(a.name) !== a.value) {
      l.setAttribute(a.name, a.value);
    }
  }
  for (const a of Array.from(l.attributes)) {
    if (!RUNTIME.has(a.name) && !n.hasAttribute(a.name)) {
      l.removeAttribute(a.name);
    }
  }
}
