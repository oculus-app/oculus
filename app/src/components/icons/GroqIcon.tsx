import { forwardRef, type ReactElement } from "react";
import { IconBase, type Icon, type IconProps, type IconWeight } from "@phosphor-icons/react";

/** Groq's bolt, the mark from its logo without the wordmark, on Phosphor's
 *  `IconBase` so it takes the same `size` and `color` as the rest. One
 *  drawing for every weight. */
// The 369.6×560.8 bolt, scaled into Phosphor's 256 box with a 24 margin.
const MARK: ReactElement = (
  <g transform="translate(59.46 23.44) scale(0.37088)">
    <path d="M165.98 342.21H0L272.4 1.5l-68.75 220.11H369.6L97.23 562.32z" />
  </g>
);
const WEIGHTS = new Map<IconWeight, ReactElement>(
  (["thin", "light", "regular", "bold", "fill", "duotone"] as const).map((w) => [w, MARK]),
);

export const GroqIcon: Icon = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <IconBase ref={ref} {...props} weights={WEIGHTS} />
));
GroqIcon.displayName = "GroqIcon";
