import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { strings } from "./data";
import { DonutChart } from "./DonutChart";
import { OpenUIChart } from "./OpenUIChart";

export { DonutChart };

export const Donut = defineComponent({
  name: "Donut",
  description: "Parts of one whole: labels[i] with values[i], at most 5 parts (the rest fold into Other). center replaces the total in the middle.",
  props: z.object({
    title: z.string(),
    labels: z.array(z.string()),
    values: z.array(z.number()),
    center: z.string().optional(),
    unit: z.string().optional(),
  }),
  component: ({ props }) => (
    <OpenUIChart>
      <DonutChart
        title={props.title}
        labels={strings(props.labels)}
        values={Array.isArray(props.values) ? props.values : []}
        center={props.center}
        unit={props.unit}
      />
    </OpenUIChart>
  ),
});
