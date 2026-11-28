import { NotePencil } from "@phosphor-icons/react";
import { SideNavSearch } from "@/components/ui/layout/SideNav";

/**
 * The column's header: the search field with the new-chat button at its
 * right (lit while no thread is open).
 */
export function ListHeader({
  query,
  onQuery,
  onSearchEnter,
  onNew,
}: {
  query: string;
  onQuery: (query: string) => void;
  /** Enter in the field: open the first result. */
  onSearchEnter: () => void;
  onNew: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 pt-3 pr-2 pb-2 pl-2.5">
      <SideNavSearch
        value={query}
        onChange={onQuery}
        onEnter={onSearchEnter}
        placeholder="Search chats"
        className="min-w-0 flex-1 p-0"
      />
      <button
        type="button"
        aria-label="New chat"
        title="New chat"
        onClick={onNew}
        className="flex size-[30px] shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-item-hover hover:text-foreground"
      >
        <NotePencil size={17} />
      </button>
    </div>
  );
}
