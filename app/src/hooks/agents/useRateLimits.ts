import { useEffect } from "react";
import { getHarnessRateLimits, harnessRefreshRateLimits, type Provider, type RateWindow } from "@/lib/harness";
import { useHarnessStore } from "@/stores/chat/harnessStore";

const NONE: RateWindow[] = [];

/** Read the stored usage windows for `UsageMeter`. Codex and Antigravity
 *  refresh on provider selection and deliver their windows through events. */
export function useRateLimits(provider: Provider): RateWindow[] {
  const windows = useHarnessStore((s) => s.rateLimits[provider]);

  useEffect(() => {
    if (windows) return;
    getHarnessRateLimits(provider).then((w) => {
      if (w.length) useHarnessStore.setState((s) => ({ rateLimits: { ...s.rateLimits, [provider]: w } }));
    });
  }, [provider, windows]);

  useEffect(() => {
    void harnessRefreshRateLimits(provider).catch(() => {});
  }, [provider]);

  return windows ?? NONE;
}
