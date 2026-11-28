import type { ReactNode } from "react";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { PaneTrail, useInSidePanel } from "@/components/tabs/PaneHeader";
import { chatHref } from "@/lib/harness";
import { useRouteThread } from "./useRouteThread";

/** A chat page's trail: its `title`, and for a subagent its parent chat as a
 *  crumb before it, marked with the parent's agent. No crumb until the
 *  parent is known, nor for a chat with no parent (or one whose parent was
 *  deleted). A long parent title truncates before the child's does. */
export function ThreadTrail({ parentId, title, lead }: {
  parentId: number | null;
  title: string;
  lead?: ReactNode;
}) {
  const { thread: parent } = useRouteThread(parentId);
  const inSide = useInSidePanel();
  const parents = parent
    ? [{
        label: parent.title?.trim() || "Untitled",
        href: chatHref(parent.id, parent.title),
        icon: <ProviderMark provider={parent.provider} className={inSide ? "size-3.5" : "size-3"} />,
      }]
    : [];
  return <PaneTrail lead={lead} parents={parents} title={title} shrinkParents />;
}
