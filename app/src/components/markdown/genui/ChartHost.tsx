import { BarChart } from "@/components/markdown/openui/components/charts/BarChart";
import { DonutChart } from "@/components/markdown/openui/components/charts/DonutChart";
import { ChartEmpty, ChartFigure, ChartStreaming } from "@/components/markdown/openui/components/charts/Figure";
import { LineChart } from "@/components/markdown/openui/components/charts/LineChart";
import { ScatterChart } from "@/components/markdown/openui/components/charts/ScatterChart";
import { parseChartAttrs, type ChartAttrs } from "./chartData";
import "./charts.css";

export type { ChartAttrs };

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
    </ChartStreaming.Provider>
  );
}
