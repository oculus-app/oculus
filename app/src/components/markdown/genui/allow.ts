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

const BEHAVIOUR_ATTRS = new Set([
  "data-choice", "data-value", "data-option", "data-show", "data-scrub", "data-options", "data-edges",
]);

/** Chart host attributes; admitted only on an HTML `div`. */
export const CHART_ATTRS = new Set([
  "data-chart", "data-title", "data-labels", "data-values", "data-series", "data-unit",
  "data-x-label", "data-y-label", "data-area", "data-center", "data-trend",
]);

const GLOBAL = new Set(["class", "id", "style", "title", "lang", "dir"]);
const TABLE = new Set(["colspan", "rowspan", "scope"]);
const ARIA = new Set(["aria-label", "aria-hidden"]);

/** Attributes whose empty string is meaningful and must not be removed. */
export const ALLOW_EMPTY = new Set(["data-area", "data-trend", "data-show"]);

/** SVG geometry and presentation attributes, each validated by a closed grammar. */
const SVG_ATTRS = new Set([
  "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "transform", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "opacity", "fill-opacity", "stroke-opacity", "font-size", "font-weight", "font-style", "text-anchor",
  "dominant-baseline", "dx", "dy", "preserveaspectratio", "offset", "stop-color", "stop-opacity",
  "gradientunits", "gradienttransform", "markerwidth", "markerheight", "refx", "refy", "orient", "markerunits",
  "clip-path", "marker-start", "marker-mid", "marker-end", "pathlength", "vector-effect", "xmlns",
]);

export function allowedAttr(name: string, svg: boolean, tag = ""): boolean {
  if (RUNTIME.has(name) || name.startsWith("on")) return false;
  if (CHART_ATTRS.has(name)) return !svg && tag === "div";
  if (GLOBAL.has(name) || BEHAVIOUR_ATTRS.has(name) || ARIA.has(name)) return true;
  if (!svg && TABLE.has(name)) return true;
  return svg && SVG_ATTRS.has(name);
}

/** Closed class vocabulary styled across `genui.css`, `controls.css` and
 *  `derive.css`; every other class is dropped so markup cannot reach app utilities. */
export const CLASSES = new Set([
  "g", "box", "g-cap", "g-label", "g-row", "g-stat", "g-out", "g-table", "g-ctl", "g-seg", "g-derive",
  "alt", "bits", "cir", "w", "gate", "orc", "mes", "mes-i", "st", "ph", "amps", "amp", "trk", "pos", "neg",
  "read", "r", "n", "l", "why", "hl", "fin", "pane", "muted", "brand", "success", "warn", "c1", "c2", "c3", "c4", "c5",
]);
export const allowedClass = (c: string) => CLASSES.has(c);

// Forbidden in every SVG presentation attribute and every inline style value.
const UNSAFE_CSS = /[\\@;{}]|\u002f\*|[\u0000-\u001f\u007f]/;
const UNSAFE_STYLE_BLOCK = /[\\@{}]|\u002f\*|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const NUM = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[+-]?\\d+)?";
const NONNEG = "(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[+-]?\\d+)?";
const UNIT = "(?:px|em|rem|pt|%)";
const LENGTH = new RegExp(`^${NUM}${UNIT}?$`, "i");
const NONNEG_LENGTH = new RegExp(`^${NONNEG}${UNIT}?$`, "i");
const LENGTH_LIST = new RegExp(`^${NUM}${UNIT}?(?:(?:\\s*,\\s*|\\s+)${NUM}${UNIT}?)*$`, "i");
const NONNEG_NUM = new RegExp(`^${NONNEG}$`, "i");
const VIEWBOX = new RegExp(`^${NUM}(?:(?:\\s*,\\s*|\\s+)${NUM}){3}$`, "i");
const DASHARRAY = new RegExp(`^(?:none|${NONNEG}${UNIT}?(?:(?:\\s*,\\s*|\\s+)${NONNEG}${UNIT}?)*)$`, "i");
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZzEe0-9+\-.,\s]+$/;
const POINTS = /^[0-9eE+\-.,\s]+$/;
const TRANSFORM_ARG = `${NUM}(?:px|%|deg|rad|turn)?`;
const TRANSFORM_FN = `(?:translate|scale|rotate|skewX|skewY|matrix)\\(\\s*${TRANSFORM_ARG}(?:(?:\\s*,\\s*|\\s+)${TRANSFORM_ARG}){0,5}\\s*\\)`;
const TRANSFORM = new RegExp(`^(?:none|${TRANSFORM_FN}(?:(?:\\s*,\\s*|\\s+)${TRANSFORM_FN})*)$`, "i");
const KEYWORD = /^[a-zA-Z0-9][a-zA-Z0-9 -]*$/;
const ORIENT = new RegExp(`^(?:auto|auto-start-reverse|${NUM}(?:deg|rad|grad|turn)?)$`, "i");
const REF_X = new RegExp(`^(?:left|center|right|${NUM}${UNIT}?)$`, "i");
const REF_Y = new RegExp(`^(?:top|center|bottom|${NUM}${UNIT}?)$`, "i");

const COLOR_KEYWORD = /^[a-zA-Z]{1,32}$/;
const COLOR_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FN_ARG = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)%?";
const COLOR_FN = new RegExp(
  `^(?:rgba?|hsla?)\\(\\s*${FN_ARG}(?:\\s*,\\s*${FN_ARG}){2,3}\\s*\\)$|^(?:rgba?|hsla?)\\(\\s*${FN_ARG}\\s+${FN_ARG}\\s+${FN_ARG}(?:\\s*\\/\\s*${FN_ARG})?\\s*\\)$`,
  "i",
);
const VAR_CALL = /^var\(\s*(--[a-zA-Z0-9-]+)(?:\s*,\s*(.+))?\s*\)$/i;
const SIMPLE_VAR = /^var\(\s*--[a-zA-Z0-9-]+\s*\)$/i;
const LOCAL_URL = /^url\(\s*#([\w-]+)\s*\)$/i;

const FONT_SIZE = /^(\d+(?:\.\d+)?|\.\d+)(px|pt|rem|em|%)?$/i;
const FONT_BOUNDS: Record<string, [number, number]> = { px: [8, 40], pt: [6, 30], rem: [0.5, 2.5], em: [0.5, 2.5], "%": [50, 250] };
const SVG_FONT_BOUNDS: Record<string, [number, number]> = { "": [0.5, 48], px: [4, 48], pt: [3, 36], rem: [0.5, 2.5], em: [0.5, 2.5], "%": [50, 250] };
const OPACITY = /^(\d+(?:\.\d+)?|\.\d+)(%)?$/;
const PLAIN_NUM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/** Only custom properties actually read by genui stylesheets, with numeric bounds. */
const CUSTOM_PROPS: Record<string, [number, number]> = { "--v": [0, 1] };

const STYLE_WEIGHT = /^(?:normal|bold|bolder|lighter|[1-9]\d{2}|1000)$/i;
const STYLE_FONT_STYLE = /^(?:normal|italic|oblique)$/i;
const STYLE_ALIGN = /^(?:left|right|center|justify|start|end)$/i;
const STYLE_ANCHOR = /^(?:start|middle|end)$/i;

const SVG_LENGTHS = new Set(["width", "height", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "offset", "markerwidth", "markerheight"]);
const SVG_LENGTH_LISTS = new Set(["x", "y", "dx", "dy"]);
const SVG_OPACITIES = new Set(["opacity", "fill-opacity", "stroke-opacity", "stop-opacity"]);
const SVG_REFS = new Set(["clip-path", "marker-start", "marker-mid", "marker-end"]);
const SVG_KEYWORDS = new Set([
  "text-anchor", "dominant-baseline", "stroke-linecap", "stroke-linejoin", "font-weight", "font-style",
  "preserveaspectratio", "gradientunits", "markerunits", "vector-effect",
]);

function isSimpleColor(v: string): boolean {
  return COLOR_KEYWORD.test(v) || COLOR_HEX.test(v) || COLOR_FN.test(v);
}

function cleanPaint(value: string, prefix: string, allowUrl: boolean): string {
  if (UNSAFE_CSS.test(value)) return "";
  const v = value.trim();
  if (!v) return "";
  if (isSimpleColor(v)) return v;
  const vm = VAR_CALL.exec(v);
  if (vm) {
    const fb = vm[2]?.trim();
    if (fb === undefined || isSimpleColor(fb) || SIMPLE_VAR.test(fb)) return v;
    return "";
  }
  if (allowUrl) {
    const um = LOCAL_URL.exec(v);
    if (um) return `url(#${prefix}-${um[1]})`;
  }
  return "";
}

function cleanRef(value: string, prefix: string): string {
  if (UNSAFE_CSS.test(value)) return "";
  const v = value.trim();
  if (/^none$/i.test(v)) return "none";
  const m = LOCAL_URL.exec(v);
  return m ? `url(#${prefix}-${m[1]})` : "";
}

function cleanFontSize(value: string, svgAttr: boolean): string {
  if (UNSAFE_CSS.test(value)) return "";
  const m = FONT_SIZE.exec(value.trim());
  if (!m) return "";
  const n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return "";
  const bounds = (svgAttr ? SVG_FONT_BOUNDS : FONT_BOUNDS)[unit];
  if (!bounds) return "";
  return `${Math.min(bounds[1], Math.max(bounds[0], n))}${unit}`;
}

function cleanOpacity(value: string): string {
  if (UNSAFE_CSS.test(value)) return "";
  const m = OPACITY.exec(value.trim());
  if (!m) return "";
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return "";
  return m[2] === "%" ? `${Math.min(100, Math.max(0, n))}%` : String(Math.min(1, Math.max(0, n)));
}

function cleanCustomProp(prop: string, value: string): string {
  const bounds = CUSTOM_PROPS[prop];
  if (!bounds || UNSAFE_CSS.test(value)) return "";
  const v = value.trim();
  if (!PLAIN_NUM.test(v)) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(bounds[1], Math.max(bounds[0], n)));
}

/** Validates inline `style` declarations per property against a closed grammar. */
export function cleanStyle(style: string, prefix = ""): string {
  if (UNSAFE_STYLE_BLOCK.test(style)) return "";
  const out: string[] = [];
  for (const decl of style.split(";")) {
    const at = decl.indexOf(":");
    if (at < 0) continue;
    const prop = decl.slice(0, at).trim().toLowerCase();
    const raw = decl.slice(at + 1).trim();
    if (!raw || UNSAFE_CSS.test(raw)) continue;
    let cleaned = "";
    if (prop in CUSTOM_PROPS) cleaned = cleanCustomProp(prop, raw);
    else if (prop === "font-size") cleaned = cleanFontSize(raw, false);
    else if (prop === "font-weight") cleaned = STYLE_WEIGHT.test(raw) ? raw : "";
    else if (prop === "font-style") cleaned = STYLE_FONT_STYLE.test(raw) ? raw : "";
    else if (prop === "fill" || prop === "stroke") cleaned = cleanPaint(raw, prefix, true);
    else if (prop === "color") cleaned = cleanPaint(raw, prefix, false);
    else if (prop === "stroke-width") cleaned = NONNEG_LENGTH.test(raw) ? raw : "";
    else if (prop === "opacity") cleaned = cleanOpacity(raw);
    else if (prop === "text-align") cleaned = STYLE_ALIGN.test(raw) ? raw : "";
    else if (prop === "text-anchor") cleaned = STYLE_ANCHOR.test(raw) ? raw : "";
    if (cleaned) out.push(`${prop}:${cleaned}`);
  }
  return out.join(";");
}

function cleanSvgAttr(name: string, value: string, prefix: string): string {
  if (name === "d") {
    if (UNSAFE_STYLE_BLOCK.test(value)) return "";
    const v = value.trim();
    return PATH_D.test(v) ? v : "";
  }
  if (name === "points") {
    if (UNSAFE_STYLE_BLOCK.test(value)) return "";
    const v = value.trim();
    return POINTS.test(v) ? v : "";
  }
  if (UNSAFE_CSS.test(value)) return "";
  const v = value.trim();
  if (!v) return "";
  if (name === "fill" || name === "stroke") return cleanPaint(v, prefix, true);
  if (name === "stop-color") return cleanPaint(v, prefix, false);
  if (SVG_REFS.has(name)) return cleanRef(v, prefix);
  if (name === "font-size") return cleanFontSize(v, true);
  if (SVG_OPACITIES.has(name)) return cleanOpacity(v);
  if (name === "viewbox") return VIEWBOX.test(v) ? v : "";
  if (name === "stroke-dasharray") return DASHARRAY.test(v) ? v : "";
  if (name === "transform" || name === "gradienttransform") return TRANSFORM.test(v) ? v : "";
  if (SVG_LENGTH_LISTS.has(name)) return LENGTH_LIST.test(v) ? v : "";
  if (SVG_LENGTHS.has(name)) return LENGTH.test(v) ? v : "";
  if (name === "stroke-width") return NONNEG_LENGTH.test(v) ? v : "";
  if (name === "pathlength") return NONNEG_NUM.test(v) ? v : "";
  if (name === "refx") return REF_X.test(v) ? v : "";
  if (name === "refy") return REF_Y.test(v) ? v : "";
  if (name === "orient") return ORIENT.test(v) ? v : "";
  if (SVG_KEYWORDS.has(name)) return KEYWORD.test(v) ? v : "";
  if (name === "xmlns") return v === "http://www.w3.org/2000/svg" ? v : "";
  return "";
}

/** Validates an already-allowed attribute value by kind; returns `""` to drop. */
export function cleanAttr(name: string, value: string, prefix: string, svg: boolean): string {
  if (name === "id") {
    const id = value.trim();
    return /^[\w-]+$/.test(id) ? `${prefix}-${id}` : "";
  }
  if (name === "class") return value.split(/\s+/).filter(allowedClass).join(" ");
  if (name === "style") return cleanStyle(value, prefix);
  if (name === "lang") return /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value.trim()) ? value.trim() : "";
  if (name === "dir") return /^(?:ltr|rtl|auto)$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
  if (name === "aria-hidden") return /^(?:true|false)$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
  if (name === "colspan" || name === "rowspan") return /^[1-9]\d{0,2}$/.test(value.trim()) ? value.trim() : "";
  if (name === "scope") return /^(?:row|col|rowgroup|colgroup)$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
  if (svg && SVG_ATTRS.has(name)) return cleanSvgAttr(name, value, prefix);
  return value;
}
