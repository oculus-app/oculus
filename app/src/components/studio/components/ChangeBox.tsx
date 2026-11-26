import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Composer } from "@/components/harness/composer/Composer";
import { Button } from "@/components/ui/button";
import { useRateLimits } from "@/hooks/agents/useRateLimits";
import type { Applied, useLibraryChange } from "@/hooks/studio/useLibraryChange";
import { chatHref, type SendOptions } from "@/lib/harness";
import { cn } from "@/lib/utils";
import { draftKey } from "@/stores/chat/draftStore";
import { useHarnessStore } from "@/stores/chat/harnessStore";

const noop = () => {};

/**
 * "Ask for a change": Chat's composer, `compact`, as on the subject
 * Overview, so it names and changes the model, level and mode and takes
 * `@` files, `/` skills and dictation. The request goes to the agent in a
 * Chat thread (the first one starts it, the rest continue it). While its
 * turn runs a send is handed back; after it, the component is read again
 * and the result is said plainly, with Undo when an earlier version exists
 * and a way to the thread.
 */
export function ChangeBox({
  name,
  working,
  applied,
  error,
  threadId,
  composer,
  onSend,
  onUndo,
}: {
  name: string;
  /** The component the running turn is changing, if any. */
  working: string | null;
  applied: Applied | null;
  error: string | null;
  threadId: number | null;
  composer: ReturnType<typeof useLibraryChange>["composer"];
  onSend: (request: string, skills: string[]) => Promise<boolean>;
  onUndo: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const subjects = useHarnessStore((s) => s.subjects);
  const { selection } = composer;
  const rateLimits = useRateLimits(selection.provider);
  const [sending, setSending] = useState(false);
  const [restore, setRestore] = useState<{ text: string; n: number } | null>(null);
  const [waitNote, setWaitNote] = useState(false);
  const handBack = useCallback((text: string) => setRestore((r) => ({ text, n: (r?.n ?? 0) + 1 })), []);
  const onRestored = useCallback(() => setRestore(null), []);
  const busy = working != null || sending;

  const send = async (request: string, extra?: SendOptions) => {
    if (busy) {
      handBack(request);
      setWaitNote(true);
      return;
    }
    setWaitNote(false);
    setSending(true);
    const ok = await onSend(request, extra?.skills ?? []);
    // A send that failed gives the words back.
    if (!ok) handBack(request);
    setSending(false);
  };
  const open = threadId == null ? null : chatHref(threadId);
  const mine = applied?.name === name ? applied : null;

  return (
    <div className="space-y-2.5">
      <Composer
        compact
        draftKey={draftKey(null, `studio-change:${name}`)}
        provider={selection.provider}
        model={selection.model}
        reasoning={selection.effort}
        locked={composer.locked}
        refused={composer.refused}
        switchFrom={composer.switchFrom}
        subjects={subjects}
        subjectId={composer.subjectId}
        threadId={composer.threadId}
        running={false}
        usage={null}
        rateLimits={rateLimits}
        restore={restore}
        onRestored={onRestored}
        onProvider={composer.onProvider}
        onModel={composer.onModel}
        onReasoning={composer.onReasoning}
        onSend={(text, _mode, extra) => void send(text, extra)}
        onStop={noop}
        placeholder={`Describe a change to ${name}`}
      />

      {waitNote && working != null && (
        <p className="text-[12.5px] text-muted-foreground">Wait for this change to finish before asking for the next.</p>
      )}
      {working != null && (
        <p className="text-[12.5px] text-muted-foreground">
          {working === name ? "The agent is changing it" : `The agent is changing ${working}`}. Its steps are in the thread.
        </p>
      )}
      {error && (
        <p data-selectable className="text-[12.5px] leading-snug text-destructive">
          {error}
        </p>
      )}
      {mine && working == null && <Outcome applied={mine} />}
      <div className={cn("flex items-center gap-2", !(mine?.undoId || open) && "hidden")}>
        {mine?.undoId && (
          <Button type="button" variant="outline" size="sm" onClick={() => void onUndo()}>
            Undo
          </Button>
        )}
        {open && (
          <Button type="button" variant="ghost" size="sm" data-tab-href={open} onClick={() => navigate(open)}>
            Open thread
          </Button>
        )}
      </div>
    </div>
  );
}

function Outcome({ applied }: { applied: Applied }) {
  const text = applied.undone
    ? "Restored the earlier version."
    : !applied.changed
      ? "The turn ended without changing it. The thread shows why."
      : applied.undoId
        ? "Changed. The earlier version is kept."
        : "Changed. There was no earlier version at this level to go back to.";
  return <p className="text-[12.5px] text-muted-foreground">{text}</p>;
}
