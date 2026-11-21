/** What a ```ui fence's markup may hold. Everything not named here is
 *  dropped (`DROP`, with its content) or unwrapped (its children kept). */

export const HTML_ELEMENTS = new Set([
  "div", "span", "p", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "small", "sub", "sup",
  "br", "hr", "code", "kbd", "mark", "abbr", "q", "blockquote", "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tr", "th", "td", "caption", "figure", "figcaption", "section", "button", "label",
]);

export const SVG_ELEMENTS = new Set([
  "svg", "g", "path", "line", "polyline", "polygon", "rect", "circle", "ellipse", "text", "tspan",
  "title", "desc", "defs", "lineargradient", "radialgradient", "stop", "marker", "clippath",
]);

export const ELEMENTS = new Set([...HTML_ELEMENTS, ...SVG_ELEMENTS]);

/** Dropped with everything inside: script, styles, embedded documents and
 *  forms, media that would fetch, links, and SVG's escape hatches. */
export const DROP = new Set([
  "script", "style", "template", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet",
  "form", "input", "textarea", "select", "option", "img", "image", "picture", "source", "video", "audio",
  "track", "link", "meta", "base", "foreignobject", "use", "animate", "animatemotion", "animatetransform",
  "set", "filter", "feimage", "math", "dialog", "portal",
]);

/** Attributes the host writes at runtime; agent copies are dropped and the
 *  morph never resets them. */
export const RUNTIME = new Set([
  "data-on", "data-off", "aria-checked", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext",
  "tabindex", "role", "hidden", "inert",
]);

/** Data attributes reserved for interactive behaviours and chart hosts. */
const DATA = new Set([
  "data-choice", "data-value", "data-option", "data-show", "data-scrub", "data-options", "data-edges",
  "data-chart", "data-title", "data-labels", "data-values", "data-series", "data-unit", "data-x-label", "data-y-label", "data-area", "data-center", "data-trend",
]);

const GLOBAL = new Set(["class", "id", "style", "title", "lang", "dir"]);
const TABLE = new Set(["colspan", "rowspan", "scope"]);

/** SVG geometry and presentation. `url(#id)` values are re-pointed at the
 *  block's own ids; any other `url(` is dropped. */
const SVG_ATTRS = new Set([
  "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "transform", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "opacity", "fill-opacity", "stroke-opacity", "font-size", "font-weight", "font-style", "text-anchor",
  "dominant-baseline", "dx", "dy", "preserveaspectratio", "offset", "stop-color", "stop-opacity",
  "gradientunits", "gradienttransform", "markerwidth", "markerheight", "refx", "refy", "orient", "markerunits",
  "clip-path", "marker-start", "marker-mid", "marker-end", "pathlength", "vector-effect", "xmlns",
]);

export function allowedAttr(name: string, svg: boolean): boolean {
  if (RUNTIME.has(name)) return false;
  if (name.startsWith("on")) return false;
  if (GLOBAL.has(name) || DATA.has(name) || TABLE.has(name)) return true;
  if (name.startsWith("aria-")) return true;
  return svg && SVG_ATTRS.has(name);
}

/** The vocabulary's class names (`genui.css`); every other class is dropped,
 *  so markup can't reach the app's utilities (`fixed inset-0`). */
export const CLASSES = new Set([
  "g", "box", "alt", "bits", "cir", "w", "gate", "orc", "mes", "st", "ph", "amps", "amp", "trk", "pos", "neg",
  "read", "r", "n", "l", "why", "hl", "fin", "mes-i", "pane", "muted", "brand", "success", "warn", "c1", "c2", "c3", "c4", "c5",
]);
export const allowedClass = (c: string) => CLASSES.has(c) || /^g-[a-z0-9-]+$/.test(c);

/** Inline style is a short allow-list: custom properties (`--v:0.5` drives
 *  bar heights) and type and paint. No positioning, no `url(`. */
const STYLE_PROPS = new Set([
  "font-size", "font-weight", "font-style", "fill", "stroke", "stroke-width", "opacity", "color",
  "text-align", "text-anchor",
]);
const STYLE_VALUE = /^[-#.,%\w\s()]*$/;

export function cleanStyle(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(";")) {
    const at = decl.indexOf(":");
    if (at < 0) continue;
    const prop = decl.slice(0, at).trim().toLowerCase();
    const value = decl.slice(at + 1).trim();
    if (!value || !STYLE_VALUE.test(value) || /url\s*\(|expression|image|attr\s*\(/i.test(value)) continue;
    if (/^--[a-z0-9-]+$/.test(prop) || STYLE_PROPS.has(prop)) out.push(`${prop}:${value}`);
  }
  return out.join(";");
}
