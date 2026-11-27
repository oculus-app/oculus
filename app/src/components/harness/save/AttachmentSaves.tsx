import { useEffect } from "react";
import { DropdownMenu } from "radix-ui";
import { FolderSimple, FolderSimplePlus } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { openCitation } from "@/lib/files/openFile";
import { useAttachmentLabel } from "@/stores/chat/attachmentNames";
import { useChatSave, useChatSaves } from "@/stores/chat/chatSaveStore";
import { useChatSaveScope } from "./ChatSaveScope";
import { SaveToDriveAction } from "./SaveToDriveAction";

/**
 * Save to Drive… in a question's hover row, for what the student attached:
 * the one control for a single file, or a menu naming each when there are
 * several. `paths` are `.oculus/agents/attachments/…`.
 */
export function AttachmentSaves({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  if (paths.length === 1) return <SaveToDriveAction path={paths[0]} look="icon" className="size-[26px]" />;
  return <SaveMenu paths={paths} />;
}

function SaveMenu({ paths }: { paths: string[] }) {
  const scope = useChatSaveScope();
  const any = useChatSaves((s) => paths.some((p) => s.states[p]));
  const key = paths.join("\n");
  useEffect(() => {
    if (scope) for (const p of key.split("\n")) useChatSaves.getState().want(p);
  }, [scope, key]);
  if (!scope || !any) return null;
  return (
    // Not modal: the hover row would flash back after a modal menu closes.
    <DropdownMenu.Root modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Save to Drive…"
              className="flex size-[26px] cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:text-foreground"
            >
              <FolderSimplePlus size={14} />
            </button>
          </DropdownMenu.Trigger>
        </TooltipTrigger>
        <TooltipContent>Save to Drive…</TooltipContent>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className="popup-motion z-50 max-w-72 min-w-48 rounded-xl border border-border-subtle bg-popover p-1 text-popover-foreground shadow-lg outline-none"
        >
          {paths.map((path) => (
            <SaveItem key={path} path={path} subjectId={scope.subjectId} />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** One attachment: its name, then Save to Drive… or, once kept, Open. */
function SaveItem({ path, subjectId }: { path: string; subjectId: number | null }) {
  const state = useChatSave(path);
  const name = useAttachmentLabel(path);
  if (!state) return null;
  const saved = state.saved;
  const Icon = saved ? FolderSimple : FolderSimplePlus;
  return (
    <DropdownMenu.Item
      disabled={state.saving}
      onSelect={() => {
        if (saved) openCitation({ path: saved.relativePath });
        else void useChatSaves.getState().save(path, subjectId);
      }}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] outline-none data-disabled:opacity-50 data-highlighted:bg-accent"
    >
      <Icon size={14} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{saved ? "Open" : "Save…"}</span>
    </DropdownMenu.Item>
  );
}
