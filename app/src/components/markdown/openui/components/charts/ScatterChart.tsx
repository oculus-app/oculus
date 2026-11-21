import { useState } from "react";
import { cn } from "@/lib/utils";
import { SERIES_FILL, SERIES_STROKE, fitLine, type SeriesData } from "./data";
import { ChartEmpty, ChartFigure, DataTable, Legend, Plot, axisTicks } from "./Figure";
import { fraction, niceAxis, valueLabel } from "./scale";

/** Points as dots with a surface ring; `trend` adds each series' least-squares line. */
export function ScatterChart({ title, series, xLabel, yLabel, trend }: { title?: unknown; series: SeriesData[]; xLabel?: unknown; yLabel?: unknown; trend?: boolean }) {
  const [active, setActive] = useState<[number, number] | null>(null);
  const drawn = series.filter((s) => s.points.length);
  if (!drawn.length) return <ChartFigure title={title}><ChartEmpty /></ChartFigure>;
  const all = drawn.flatMap((s) => s.points);
  const xAxis = niceAxis(Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.x)));
  const yAxis = niceAxis(Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y)));
  const sx = (x: number) => fraction(xAxis, x) * 100;
  const sy = (y: number) => 100 - fraction(yAxis, y) * 100;
  const hovered = active ? drawn[active[0]]?.points[active[1]] : null;
  return <ChartFigure title={title}>
    <Plot yTicks={axisTicks(yAxis)} xTicks={axisTicks(xAxis)} xLabel={xLabel} yLabel={yLabel} onLeave={() => setActive(null)}
      readout={hovered && <>{drawn.length > 1 && <span className="text-muted-foreground">{drawn[active![0]].label} </span>}({valueLabel(hovered.x)}, {valueLabel(hovered.y)})</>}>
      {trend && <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        {drawn.map((s, i) => {
          const fit = fitLine(s.points);
          if (!fit) return null;
          return <line key={i} x1={0} x2={100} y1={sy(fit.intercept + fit.slope * xAxis.lo)} y2={sy(fit.intercept + fit.slope * xAxis.hi)}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={cn("openui-mark opacity-60", SERIES_STROKE[i])} />;
        })}
      </svg>}
      <svg role="img" aria-label="Scatter points" viewBox="0 0 320 160" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-hidden">
        {drawn.map((s, i) => s.points.map((p, j) => <circle key={`${i}-${j}`} cx={sx(p.x) * 3.2} cy={sy(p.y) * 1.6} r={3}
          className={cn("openui-mark stroke-card", SERIES_FILL[i].replace("bg-", "fill-"), active && (active[0] !== i || active[1] !== j) && "opacity-60")}
          onPointerEnter={() => setActive([i, j])} onPointerDown={() => setActive([i, j])} />))}
      </svg>
    </Plot>
    <Legend entries={drawn.map((s, i) => ({ label: s.label, swatch: SERIES_FILL[i] }))} />
    <DataTable head={["Series", "x", "y"]} rows={drawn.flatMap((s) => s.points.map((p) => [s.label, valueLabel(p.x), valueLabel(p.y)]))} />
  </ChartFigure>;
}
