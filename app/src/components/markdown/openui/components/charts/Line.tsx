import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { seriesList } from "./data";
import { LineChart } from "./LineChart";
import { OpenUIChart } from "./OpenUIChart";
import { chartData } from "./Series";

export { LineChart };

export const Line = defineComponent({
  name: "Line",
  description: "A line chart over x; several Series get a legend. area fills under the series.",
  props: z.object({
    title: z.string(),
    series: chartData,
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    area: z.boolean().optional(),
  }),
  component: ({ props }) => (
    <OpenUIChart>
      <LineChart title={props.title} series={seriesList(props.series)} xLabel={props.xLabel} yLabel={props.yLabel} area={props.area === true} />
    </OpenUIChart>
  ),
});
