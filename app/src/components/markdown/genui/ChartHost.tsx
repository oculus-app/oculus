import { mathsReady, renderToString, useMathsReady } from "@/lib/maths";
import { RichTextRenderer } from "@/components/markdown/openui/components/Frame";
import { BarChart } from "@/components/markdown/openui/components/charts/BarChart";
import { DonutChart } from "@/components/markdown/openui/components/charts/DonutChart";
import { ChartEmpty, ChartFigure, ChartPlainText, ChartStreaming } from "@/components/markdown/openui/components/charts/Figure";
import { LineChart } from "@/components/markdown/openui/components/charts/LineChart";
import { ScatterChart } from "@/components/markdown/openui/components/charts/ScatterChart";
import { parseChartAttrs, type ChartAttrs } from "./chartData";
import { splitMaths } from "./maths";
import "./charts.css";

export type { ChartAttrs };

function renderFormula(tex: string, display: boolean): { html?: string; error?: string } {
  try {
    return { html: renderToString(tex, { displayMode: display, sourceMap: true, throwOnError: true }) };
  } catch {
    try {
      return { html: renderToString(tex, { displayMode: display, sourceMap: true, strict: "ignore", throwOnError: false }) };
    } catch (e) {
      return { error: String(e) };
    }
  }
}

/** Plain-text equivalent of a `ui` chart label for screen-reader tables and
 *  figure `aria-label`s: strips `$…$` / `$$…$$` delimiters and unescapes `\$`. */
export function plainMathText(text: string): string {
  if (!text.includes("$")) return text;
  const { pieces } = splitMaths(text);
  return pieces.map((p) => ("text" in p ? p.text : p.tex)).join("");
}

/** Plain text plus `$…$` maths only: no Markdown, links, images or raw HTML. */
function PlainMathLabel({ text, className }: { text: string; className?: string }) {
  useMathsReady();
  if (!text.includes("$")) return className ? <span className={className}>{text}</span> : <>{text}</>;
  const { pieces } = splitMaths(text);
  const ready = mathsReady();
  const body = pieces.map((p, i) => {
    if ("text" in p) return p.text;
    const cls = p.display ? "genui-math genui-math-display" : "genui-math";
    if (!ready) return <span key={i} className={`${cls} md-math-pending`}>{p.tex}</span>;
    const { html, error } = renderFormula(p.tex, p.display);
    if (html != null) return <span key={i} className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
    return <span key={i} className="katex-error" title={error ?? ""}>{p.tex}</span>;
  });
  return className ? <span className={className}>{body}</span> : <>{body}</>;
}

/**
 * Draws a `[data-chart]` element directly with the app's chart components,
 * without mounting the OpenUI runtime. Once a chart's opening tag closes all
 * its data attributes are already present, so `ChartStreaming` is false.
 */
export function ChartHost({ attrs }: { attrs: ChartAttrs }) {
  const parsed = parseChartAttrs(attrs);
  if (!parsed) return null;
  return (
    <ChartStreaming.Provider value={false}>
      <RichTextRenderer.Provider value={PlainMathLabel}>
        <ChartPlainText.Provider value={plainMathText}>
          {parsed.kind === "empty" && (
            <ChartFigure title={parsed.title}>
              <ChartEmpty message="No data" />
            </ChartFigure>
          )}
          {parsed.kind === "bar" && (
            <BarChart title={parsed.title} labels={parsed.labels} values={parsed.values} yLabel={parsed.yLabel} unit={parsed.unit} />
          )}
          {parsed.kind === "line" && (
            <LineChart title={parsed.title} series={parsed.series} xLabel={parsed.xLabel} yLabel={parsed.yLabel} area={parsed.area} />
          )}
          {parsed.kind === "donut" && (
            <DonutChart title={parsed.title} labels={parsed.labels} values={parsed.values} center={parsed.center} unit={parsed.unit} />
          )}
          {parsed.kind === "scatter" && (
            <ScatterChart title={parsed.title} series={parsed.series} xLabel={parsed.xLabel} yLabel={parsed.yLabel} trend={parsed.trend} />
          )}
        </ChartPlainText.Provider>
      </RichTextRenderer.Provider>
    </ChartStreaming.Provider>
  );
}
