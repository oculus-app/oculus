import { useRef, type KeyboardEvent } from "react";
import { FolderSimple } from "@phosphor-icons/react";
import { SIDE_NAV_ROW_ACTIVE, SIDE_NAV_ROW_IDLE } from "@/components/ui/layout/SideNav";
import { useScrollFade } from "@/hooks/ui/useScrollFade";
import type { WorkspaceEntry } from "@/lib/ed/lessons";
import { fileIconFor } from "@/lib/files/fileTypes";
import { cn } from "@/lib/utils";

/** Indent per folder level: past the parent's glyph. */
const STEP = 14;

/**
 * A challenge's files as Ed's tree lists them: folders as plain headings with
 * their files indented below, each file a row that shows it. ↑/↓ move between
 * files. The column's one scroller.
 */
export function WorkspaceTree({
  entries,
  selected,
  onSelect,
}: {
  entries: WorkspaceEntry[];
  /** Workspace-relative path of the file shown. */
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useScrollFade(listRef, "y", entries.length);
  const filePaths = entries.filter((e) => e.kind === "file").map((e) => e.path);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step || filePaths.length === 0) return;
    e.preventDefault();
    const at = selected ? filePaths.indexOf(selected) : -1;
    const next = Math.min(filePaths.length - 1, Math.max(0, at + step));
    if (next === at) return;
    onSelect(filePaths[next]);
    listRef.current?.querySelectorAll<HTMLButtonElement>("[data-workspace-file]")[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tree"
      aria-label="Workspace files"
      onKeyDown={onKeyDown}
      className="h-full space-y-px overflow-y-auto overflow-x-hidden p-2"
    >
      {entries.map((entry) => {
        const indent = { paddingLeft: 8 + entry.depth * STEP };
        if (entry.kind === "folder") {
          return (
            <div
              key={`d:${entry.path}`}
              role="treeitem"
              aria-expanded
              title={entry.path}
              style={indent}
              className="flex h-[28px] items-center gap-2 pr-2 text-[12.5px] text-muted-foreground"
            >
              <FolderSimple size={14} className="shrink-0 opacity-70" aria-hidden />
              <span className="min-w-0 truncate">{entry.name}</span>
            </div>
          );
        }
        const Icon = fileIconFor(entry.name);
        const active = entry.path === selected;
        return (
          <button
            key={`f:${entry.path}`}
            type="button"
            role="treeitem"
            data-workspace-file
            aria-selected={active}
            title={entry.path}
            style={indent}
            onClick={() => onSelect(entry.path)}
            className={cn(
              "flex h-[28px] w-full items-center gap-2 rounded-md pr-2 text-[12.5px] transition-colors",
              active ? SIDE_NAV_ROW_ACTIVE : SIDE_NAV_ROW_IDLE,
            )}
          >
            <Icon size={14} className="shrink-0 opacity-70" aria-hidden />
            <span className="min-w-0 truncate">{entry.name}</span>
          </button>
        );
      })}
    </div>
  );
}
