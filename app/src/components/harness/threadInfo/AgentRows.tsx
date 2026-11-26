import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { useRouteThread } from "@/components/harness/threads/useRouteThread";
import { useProviderModels } from "@/hooks/agents/useProviderModels";
import { chatHref, getChildThreads, providerLabel, type HarnessThread, type Provider } from "@/lib/harness";
import { AGENT_STATE_LABEL, agentState, byNewestStarted, type AgentState } from "@/lib/harness/children";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { InfoGroup, InfoRow } from "./InfoRow";
import { openTarget } from "./openTarget";

/** Each state's tone: brand only while it works, warning while it waits on
 *  the student, as the Chat column's pills are. */
const TONE: Record<AgentState, string> = {
  approval: "text-warning",
  input: "text-warning",
  working: "text-brand",
  failed: "text-destructive",
  stopped: "text-muted-foreground",
  done: "text-success",
  waiting: "text-muted-foreground",
};

/** A chat's children from the store, newest first. Children older than the
 *  threads the store has read are read once by parent and kept, so the
 *  group lists every one; their states then follow the store's events. */
function useChildThreads(parentId: number): HarnessThread[] {
  useEffect(() => {
    let live = true;
    getChildThreads(parentId)
      .then((found) => {
        if (!live) return;
        const { keep } = useHarnessStore.getState();
        for (const t of found) keep(t);
      })
      .catch((e) => console.error("child threads read failed", e));
    return () => {
      live = false;
    };
  }, [parentId]);
  const kids = useHarnessStore(useShallow((s) => s.threads.filter((t) => t.parent_id === parentId)));
  return useMemo(() => byNewestStarted(kids), [kids]);
}

/** The Agents group: each child's agent mark, title, model and state. A row
 *  opens the child beside the chat. Nothing is drawn for a chat with none. */
export function AgentsGroup({ thread, onOpened }: { thread: HarnessThread; onOpened?: () => void }) {
  const kids = useChildThreads(thread.id);
  // Ids, not the store's live map, which changes on every streamed token. A
  // child read by parent has no live entry until its next event: its row's status stands.
  const runningKey = useHarnessStore((s) => kids.filter((k) => s.live[k.id]?.running ?? k.status === "running").map((k) => k.id).join(","));
  const running = useMemo(() => new Set(runningKey ? runningKey.split(",").map(Number) : []), [runningKey]);
  const providers = useMemo(() => [...new Set(kids.map((k) => k.provider))], [kids]);
  // The catalogues as already read; no CLI is started for a name.
  const { modelsFor } = useProviderModels(providers, { start: false });
  const modelName = (p: Provider, model: string | null) =>
    model ? (modelsFor(p).find((m) => m.id === model)?.label ?? model) : providerLabel(p);

  return (
    <InfoGroup
      heading="Agents"
      rows={kids}
      render={(k) => {
        const state = agentState(k, running.has(k.id));
        const title = k.title?.trim() || "Untitled";
        const model = modelName(k.provider, k.model);
        return (
          <InfoRow
            key={k.id}
            icon={<ProviderMark provider={k.provider} className="size-[15px]" />}
            label={
              <>
                <span className="block truncate">{title}</span>
                <span className="block truncate text-[11.5px] leading-4 text-muted-foreground">{model}</span>
              </>
            }
            title={`${title} · ${model}`}
            trailing={<span className={TONE[state]}>{AGENT_STATE_LABEL[state]}</span>}
            onOpen={(newTab) => {
              openTarget({ kind: "route", href: chatHref(k.id, k.title) }, newTab);
              onOpened?.();
            }}
          />
        );
      }}
    />
  );
}

/** A child's own card names the chat it came from, opening it beside. */
export function ParentRow({ parentId, onOpened }: { parentId: number; onOpened?: () => void }) {
  const { thread: parent } = useRouteThread(parentId);
  if (!parent) return null;
  const title = parent.title?.trim() || "Untitled";
  return (
    <InfoRow
      icon={<ProviderMark provider={parent.provider} className="size-[15px]" />}
      label={
        <>
          <span className="text-muted-foreground">From </span>
          {title}
        </>
      }
      title={`Started from ${title}`}
      onOpen={(newTab) => {
        openTarget({ kind: "route", href: chatHref(parent.id, parent.title) }, newTab);
        onOpened?.();
      }}
    />
  );
}
