import type { ReactNode } from "react";
import { useIsStreaming } from "@openuidev/react-lang";
import { ChartStreaming } from "./Figure";

/** Bridges OpenUI's streaming context into the standalone chart components. */
export function OpenUIChart({ children }: { children: ReactNode }) {
  return <ChartStreaming.Provider value={useIsStreaming()}>{children}</ChartStreaming.Provider>;
}
