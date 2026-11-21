import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { seriesList } from "./data";
import { OpenUIChart } from "./OpenUIChart";
import { ScatterChart } from "./ScatterChart";
import { chartData } from "./Series";

export { ScatterChart };

export const Scatter = defineComponent({
  name: "Scatter",
  description: "Points against two measures; several Series get a legend. trend draws each series' best-fit line.",
  props: z.object({
    title: z.string(),
    series: chartData,
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    trend: z.boolean().optional(),
  }),
  component: ({ props }) => (
    <OpenUIChart>
      <ScatterChart
        title={props.title}
        series={seriesList(props.series)}
        xLabel={props.xLabel}
        yLabel={props.yLabel}
        trend={props.trend === true}
      />
    </OpenUIChart>
  ),
});
