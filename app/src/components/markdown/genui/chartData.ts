import { MAX_SERIES, type Point, type SeriesData } from "@/components/markdown/openui/components/charts/data";

/** A chart element's attributes, as the sanitised markup wrote them. */
export type ChartAttrs = Record<string, string>;

const MAX_ITEMS = 400;

export type ParsedChart =
  | { kind: "bar"; title?: string; labels: string[]; values: number[]; yLabel?: string; unit?: string }
  | { kind: "line"; title?: string; series: SeriesData[]; xLabel?: string; yLabel?: string; area: boolean }
  | { kind: "donut"; title?: string; labels: string[]; values: number[]; center?: string; unit?: string }
  | { kind: "scatter"; title?: string; series: SeriesData[]; xLabel?: string; yLabel?: string; trend: boolean }
  | { kind: "empty"; title?: string };

function opt(attrs: ChartAttrs, name: string): string | undefined {
  const v = attrs[name]?.trim();
  return v ? v : undefined;
}

function hasFlag(attrs: ChartAttrs, name: string): boolean {
  if (!(name in attrs)) return false;
  const v = attrs[name].trim().toLowerCase();
  return v !== "false" && v !== "0";
}

function parseNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseNumbers(raw: string | undefined): number[] | null {
  const text = raw?.trim();
  if (!text) return null;
  const tokens = text.split(/[\s,]+/).filter(Boolean).slice(0, MAX_ITEMS);
  if (!tokens.length) return null;
  const out: number[] = [];
  for (const token of tokens) {
    const n = parseNumber(token);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

function parseLabels(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split("|").map((s) => s.trim());
}

function parsePointTokens(tokens: string[]): Point[] | null {
  const paired = tokens.some((t) => t.includes(","));
  const pts: Point[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (paired) {
      const parts = token.split(",");
      if (parts.length !== 2) return null;
      const x = parseNumber(parts[0]);
      const y = parseNumber(parts[1]);
      if (x === null || y === null) return null;
      pts.push({ x, y });
    } else {
      const y = parseNumber(token);
      if (y === null) return null;
      pts.push({ x: i, y });
    }
  }
  return pts.length ? pts : null;
}

function parseSeries(raw: string | undefined): SeriesData[] | null {
  const text = raw?.trim();
  if (!text) return null;
  const parts = text.split(";").map((p) => p.trim()).filter(Boolean).slice(0, MAX_SERIES);
  if (!parts.length) return null;
  const series: SeriesData[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const at = part.indexOf(":");
    const label = at >= 0 ? part.slice(0, at).trim() || `Series ${i + 1}` : `Series ${i + 1}`;
    const body = (at >= 0 ? part.slice(at + 1) : part).trim();
    if (!body) return null;
    const tokens = body.split(/\s+/).filter(Boolean).slice(0, MAX_ITEMS);
    const pts = parsePointTokens(tokens);
    if (!pts) return null;
    series.push({ label, points: pts });
  }
  return series.length ? series : null;
}

/**
 * Parses `data-chart` attributes into props for the app's chart components.
 * Unsupported chart kinds return `null`; a supported kind with missing or
 * unparseable numbers returns `{ kind: "empty", title }` so the host draws
 * a muted "No data" state instead of a broken plot.
 */
export function parseChartAttrs(attrs: ChartAttrs): ParsedChart | null {
  const kind = attrs["data-chart"]?.trim().toLowerCase();
  const title = opt(attrs, "data-title");

  if (kind === "bar") {
    const values = parseNumbers(attrs["data-values"]);
    if (!values) return { kind: "empty", title };
    return {
      kind: "bar",
      title,
      labels: parseLabels(attrs["data-labels"]),
      values,
      yLabel: opt(attrs, "data-y-label"),
      unit: opt(attrs, "data-unit"),
    };
  }

  if (kind === "donut") {
    const values = parseNumbers(attrs["data-values"]);
    if (!values || values.some((v) => v < 0) || !values.some((v) => v > 0)) {
      return { kind: "empty", title };
    }
    return {
      kind: "donut",
      title,
      labels: parseLabels(attrs["data-labels"]),
      values,
      center: opt(attrs, "data-center"),
      unit: opt(attrs, "data-unit"),
    };
  }

  if (kind === "line") {
    let series = parseSeries(attrs["data-series"]);
    if (!series && !attrs["data-series"]?.trim() && attrs["data-values"]?.trim()) {
      const ys = parseNumbers(attrs["data-values"]);
      if (ys) series = [{ label: "Value", points: ys.map((y, x) => ({ x, y })) }];
    }
    if (!series || !series.some((s) => s.points.length >= 2)) {
      return { kind: "empty", title };
    }
    return {
      kind: "line",
      title,
      series,
      xLabel: opt(attrs, "data-x-label"),
      yLabel: opt(attrs, "data-y-label"),
      area: hasFlag(attrs, "data-area"),
    };
  }

  if (kind === "scatter") {
    const series = parseSeries(attrs["data-series"]);
    if (!series || !series.some((s) => s.points.length >= 1)) {
      return { kind: "empty", title };
    }
    return {
      kind: "scatter",
      title,
      series,
      xLabel: opt(attrs, "data-x-label"),
      yLabel: opt(attrs, "data-y-label"),
      trend: hasFlag(attrs, "data-trend"),
    };
  }

  return null;
}
