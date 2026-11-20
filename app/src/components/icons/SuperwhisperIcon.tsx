import { forwardRef, type ReactElement } from "react";
import { IconBase, type Icon, type IconProps, type IconWeight } from "@phosphor-icons/react";

/** Superwhisper's mark (S1-mini's maker) on Phosphor's `IconBase`, so it
 *  takes the same `size` and `color` as the rest. One drawing for every
 *  weight, mirrored as the vendor draws it. */
// The 828×755 mark, scaled into Phosphor's 256 box with a 24 margin.
const MARK: ReactElement = (
  <g transform="translate(232 33.15) scale(-0.251208 0.251208)">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M531.147 67.6699C479.376 -22.5565 348.472 -22.5567 296.701 67.6698L17.9125 553.543C-33.3743 642.926 31.5864 754.027 135.135 754.027H692.712C796.261 754.027 861.222 642.926 809.935 553.543L531.147 67.6699ZM413.924 197.368C351.676 234.479 218.218 363.624 182.363 583.318C267.02 620.429 478.163 672.384 645.484 583.318C635.525 496.727 575.269 298.309 413.924 197.368Z"
    />
  </g>
);
const WEIGHTS = new Map<IconWeight, ReactElement>(
  (["thin", "light", "regular", "bold", "fill", "duotone"] as const).map((w) => [w, MARK]),
);

export const SuperwhisperIcon: Icon = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <IconBase ref={ref} {...props} weights={WEIGHTS} />
));
SuperwhisperIcon.displayName = "SuperwhisperIcon";
