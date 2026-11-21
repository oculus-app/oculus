import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { BarChart } from "./BarChart";
import { strings } from "./data";
import { OpenUIChart } from "./OpenUIChart";

export { BarChart };

export const Bar = defineComponent({
  name: "Bar",
  description: "Bars comparing categories: labels[i] with values[i]; unit formats values, e.g. Bar(\"Hours this week\", [\"Mon\", \"Tue\"], [2, 3.5], null, \"h\").",
  props: z.object({
    title: z.string(),
    labels: z.array(z.string()),
    values: z.array(z.number().nullable()),
    yLabel: z.string().optional(),
    unit: z.string().optional(),
  }),
  component: ({ props }) => (
    <OpenUIChart>
      <BarChart title={props.title} labels={strings(props.labels)} values={Array.isArray(props.values) ? props.values : []} yLabel={props.yLabel} unit={props.unit} />
    </OpenUIChart>
  ),
});
