import { ChatsCircle } from "@phosphor-icons/react";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { openTarget } from "@/components/harness/threadInfo/openTarget";
import { useRouteThread } from "@/components/harness/threads/useRouteThread";
import { chatHref } from "@/lib/harness";

/** A subagent brief's first line: "From ⟨parent's title⟩", opening the
 *  parent beside the chat (a new tab on ⌘-click). A deleted parent is named
 *  as such, with no link. */
export function BriefFrom({ parentId }: { parentId: number }) {
  const { thread: parent, missing } = useRouteThread(parentId);
  return (
    <div data-copy-skip className="flex min-w-0 select-none items-center gap-1.5 text-[11.5px] text-muted-foreground">
      {parent ? (
        <ProviderMark provider={parent.provider} className="size-3 shrink-0" />
      ) : (
        <ChatsCircle size={12} className="shrink-0" aria-hidden />
      )}
      <span className="shrink-0">From</span>
      {parent ? (
        <button
          type="button"
          data-tab-href={chatHref(parent.id, parent.title)}
          title={parent.title?.trim() || "Untitled"}
          // ⌘-click and a middle click take `data-tab-href` to a new tab first.
          onClick={() => openTarget({ kind: "route", href: chatHref(parent.id, parent.title) }, false)}
          className="min-w-0 cursor-pointer truncate font-medium text-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {parent.title?.trim() || "Untitled"}
        </button>
      ) : (
        <span className="min-w-0 truncate">{missing ? "a chat that was deleted" : "another chat"}</span>
      )}
    </div>
  );
}
