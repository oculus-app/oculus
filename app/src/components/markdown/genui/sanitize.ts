import { ALLOW_EMPTY, allowedAttr, cleanAttr, DROP, HTML_ELEMENTS, SVG_ELEMENTS } from "./allow";
import { mathify } from "./maths";

const SVG_NS = "http://www.w3.org/2000/svg";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const NO_MATHS = new Set(["code", "kbd"]);

/**
 * Parses markup into an inert fragment (a `<template>`'s content runs no
 * script and fetches nothing) and strips it to the allow-list in `allow.ts`.
 * Ids are prefixed with the block's own `prefix`, and `url(#id)` references
 * follow them, so two blocks never share an id with each other or the app.
 * Text outside SVG and code has its `$…$` drawn by the maths engine.
 */
export function sanitize(markup: string, prefix: string): DocumentFragment {
  const t = document.createElement("template");
  t.innerHTML = markup;
  const frag = t.content;
  clean(frag, prefix, false, false);
  return frag;
}

function clean(parent: Node, prefix: string, svg: boolean, code: boolean) {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!svg && !code) mathify(node as Text);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.parentNode?.removeChild(node);
      continue;
    }
    const el = node as Element;
    const name = el.localName.toLowerCase();
    if (DROP.has(name)) {
      el.remove();
      continue;
    }
    const inSvg = el.namespaceURI === SVG_NS;
    const allowed = inSvg ? SVG_ELEMENTS.has(name) : el.namespaceURI === HTML_NS && HTML_ELEMENTS.has(name);
    if (!allowed) {
      clean(el, prefix, svg, code);
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    attrs(el, prefix, inSvg, name);
    if (name === "button") el.setAttribute("type", "button");
    if (!inSvg && el.hasAttribute("data-chart")) {
      el.replaceChildren();
      continue;
    }
    clean(el, prefix, inSvg, code || NO_MATHS.has(name));
    // A wide table scrolls horizontally inside the block without widening the column.
    if (!inSvg && name === "table" && !el.parentElement?.classList.contains("g-table")) {
      const wrap = document.createElement("div");
      wrap.className = "g-table";
      el.replaceWith(wrap);
      wrap.appendChild(el);
    }
  }
}

function attrs(el: Element, prefix: string, svg: boolean, tag: string) {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (!allowedAttr(name, svg, tag)) {
      el.removeAttribute(attr.name);
      continue;
    }
    const value = cleanAttr(name, attr.value, prefix, svg);
    if (!value && !ALLOW_EMPTY.has(name)) el.removeAttribute(attr.name);
    else if (value !== attr.value) el.setAttribute(attr.name, value);
  }
}
