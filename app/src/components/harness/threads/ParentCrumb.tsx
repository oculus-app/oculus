import { ProviderMark } from "@/components/icons/ProviderMark";
import { useInSidePanel } from "@/components/tabs/PaneHeader";
import { BreadcrumbItems } from "@/components/ui/Breadcrumb";
import { chatHref } from "@/lib/harness";
import { cn } from "@/lib/utils";
import { useRouteThread } from "./useRouteThread";

/** A subagent's page header: its parent chat as a crumb before the child's
 *  title, marked with the parent's agent. Nothing until the parent is known;
 *  nothing for a chat with no parent (or one whose parent was deleted). */
export function ParentCrumb({ parentId }: { parentId: number | null }) {
  const { thread: parent } = useRouteThread(parentId);
  const inSide = useInSidePanel();
  if (!parent) return null;
  const title = parent.title?.trim() || "Untitled";
  return (
    // As a subject page's crumbs sit; a long parent title truncates before the child's does.
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-2.5 text-[11px] text-muted-foreground",
        inSide ? "shrink-0" : "min-w-0 max-w-[45%] shrink",
      )}
    >
      <BreadcrumbItems
        items={[
          {
            label: title,
            href: chatHref(parent.id, parent.title),
            icon: <ProviderMark provider={parent.provider} className="size-3" />,
          },
        ]}
        visible={inSide ? 0 : 2}
        trailing
      />
    </nav>
  );
}
