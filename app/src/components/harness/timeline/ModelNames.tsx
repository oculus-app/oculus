import { createContext, memo, useContext, useMemo, type ReactNode } from "react";
import { ArrowsLeftRight, ChatsCircle } from "@phosphor-icons/react";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { useProviderModels } from "@/hooks/agents/useProviderModels";
import { providerLabel, runDivider, type ModelName, type Provider } from "@/lib/harness";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import type { RunChange } from "./rows";
import { SystemDivider } from "./SystemDivider";

const ModelNames = createContext<ModelName>((_provider, model) => model);

/** The model-name lookup footers and dividers read: the catalogues of the
 *  agents this thread's runs went to, read without starting a CLI that only
 *  its Settings page starts (`start: false`). A model no catalogue lists is
 *  named by its id. Children pass through unchanged, so a catalogue landing
 *  redraws only the rows that read a name. */
export function ModelNamesProvider({ threadId, children }: { threadId: number | null; children: ReactNode }) {
  // A primitive, so a run's settling does not redraw the provider.
  const key = useHarnessStore((s) => {
    const runs = threadId == null ? undefined : s.runs[threadId];
    return [...new Set(Object.values(runs ?? {}).flatMap((r) => (r.provider ? [r.provider] : [])))].sort().join(" ");
  });
  const needed = useMemo(() => (key ? (key.split(" ") as Provider[]) : []), [key]);
  const { modelsFor } = useProviderModels(needed, { start: false });
  const name = useMemo<ModelName>(
    () => (provider, model) => modelsFor(provider).find((m) => m.id === model)?.label ?? model,
    [modelsFor],
  );
  return <ModelNames.Provider value={name}>{children}</ModelNames.Provider>;
}

export const useModelName = () => useContext(ModelNames);

/** Above a run's question: `{from} → {to}` where it switched agent, model or
 *  level, and its context handoff ("Context handoff", "… pending", danger
 *  tone when it was never delivered), in one line. A switch of agent leads
 *  with the handoff, then each side marked with its agent's logo. */
export const RunDividerRow = memo(function RunDividerRow({ change }: { change: RunChange }) {
  const name = useModelName();
  const divider = runDivider(change.before, change.run, name);
  if (!divider) return null;
  const agents = divider.agents;
  const sides = agents && <SwitchSides providers={agents.providers} sides={agents.sides} />;
  return (
    <div title={divider.title} className="pb-1">
      <SystemDivider
        icon={divider.switched ? ArrowsLeftRight : ChatsCircle}
        label={agents && !agents.handoff ? sides : divider.label}
        detail={
          agents?.handoff ? (
            <>
              {sides}
              {divider.detail && <span>· {divider.detail}</span>}
            </>
          ) : (
            divider.detail
          )
        }
        tone={divider.tone}
      />
    </div>
  );
}, (a, b) => a.change.run === b.change.run && a.change.before === b.change.before);

/** `[mark] from → [mark] to`, each side kept whole when the line wraps; the
 *  agent's name is the mark's tooltip and screen-reader text. */
function SwitchSides({ providers: [a, b], sides: [from, to] }: { providers: [Provider, Provider]; sides: [string, string] }) {
  const side = (provider: Provider, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span title={providerLabel(provider)} className="inline-flex">
        <ProviderMark provider={provider} className="size-3 shrink-0" />
      </span>
      <span className="sr-only">{providerLabel(provider)}</span>
      {text}
    </span>
  );
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5">
      {side(a, from)}
      <span aria-hidden>→</span>
      {side(b, to)}
    </span>
  );
}
