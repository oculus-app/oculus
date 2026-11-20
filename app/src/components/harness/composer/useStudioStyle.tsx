import { useState } from "react";
import { StyleChip } from "@/components/studio/style/StyleChip";
import { readStyle, writeStyle, type StudioStyle } from "@/components/studio/style/style";
import { useStoredState } from "@/hooks/ui/useStoredState";
import { useThemes } from "@/hooks/studio/useThemes";
import { useThemeDefaults } from "@/hooks/studio/useThemeDefaults";
import { readSetupProblems, type SetupProblem } from "@/lib/studio/setup";
import { studioStyleContext } from "@/lib/studio/chatStyle";
import { navigateActive } from "@/lib/shell/tabRouters";
import { useVideosStore } from "@/stores/studio/videosStore";
import type { SendOptions } from "@/lib/harness";

/** The chip is the only switch. The setup read keeps the draft intact on refusal. */
export function useStudioStyle(enabled: boolean, threadId: number | null, subject: string | null, skills: readonly string[]) {
  const linked = useVideosStore((s) => threadId != null && s.videos.some((v) => v.threadId === threadId));
  const [stored, setStored] = useStoredState("oculus-studio-style", readStyle, writeStyle);
  const [theme, setTheme] = useState<string | null>(null);
  const [problems, setProblems] = useState<SetupProblem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const themes = useThemes(subject);
  const { defaults } = useThemeDefaults(subject);
  const style: StudioStyle = { ...stored, theme };
  const shown = enabled && !linked && skills.includes("oculus-studio");
  return {
    leading: shown && <StyleChip style={style} themes={themes} defaultTheme={defaults?.effective ?? null}
      onChange={(next) => { setTheme(next.theme); setStored(next); }} />,
    feedback: shown && <div className="space-y-1 text-[12px] text-destructive" role={error || problems.length ? "alert" : undefined}>
      {error}
      {problems.map((p) => <p key={p.id}>{p.message}{" "}<button type="button" data-tab-href={p.href}
        className="cursor-pointer text-brand hover:underline" onClick={() => navigateActive(p.href)}>Open settings</button></p>)}
    </div>,
    prepare: async (picked: readonly string[]): Promise<SendOptions | null> => {
      if (!enabled || linked || !picked.includes("oculus-studio")) return {};
      setError(null);
      try {
        const { problems: missing } = await readSetupProblems();
        setProblems(missing);
        if (missing.length) return null;
        return { studioStyle: style, context: studioStyleContext(style) };
      } catch (e) {
        setError(String(e));
        return null;
      }
    },
  };
}
