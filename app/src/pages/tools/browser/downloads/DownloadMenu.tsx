import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { ArrowSquareUpRight, DotsThreeVertical, Folder, FolderOpen, Trash, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const ITEM =
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] outline-none data-highlighted:bg-accent";

function Item({ icon, children, destructive, onSelect }: {
  icon: ReactNode;
  children: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(ITEM, destructive && "text-destructive data-highlighted:bg-destructive/10")}
    >
      <span className={cn("flex size-4 items-center justify-center", destructive ? "text-destructive" : "text-muted-foreground")}>
        {icon}
      </span>
      {children}
    </DropdownMenu.Item>
  );
}

/** What a row's menu offers; a callback left out leaves its item out. */
export interface DownloadActions {
  open?: () => void;
  showInDrive?: () => void;
  reveal?: { label: string; run: () => void };
  clear?: () => void;
  delete?: () => void;
}

/**
 * A settled download's one ⋮ menu. Not modal, as `RowMenu` isn't: a modal
 * menu sets `pointer-events: none` on the body, which WebKit keeps on the
 * list's rows until the mouse moves.
 */
export function DownloadMenu({ name, actions }: { name: string; actions: DownloadActions }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${name}`}
          title="More"
          className="-mt-0.5 -mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <DotsThreeVertical size={14} weight="bold" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className="popup-motion z-50 min-w-44 rounded-xl border border-border-subtle bg-popover p-1 text-popover-foreground shadow-lg outline-none"
          // Delete asks in a dialog that takes focus; the trigger must not take it back.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {actions.open && <Item icon={<ArrowSquareUpRight size={14} />} onSelect={actions.open}>Open</Item>}
          {actions.showInDrive && <Item icon={<Folder size={14} />} onSelect={actions.showInDrive}>Show in Drive</Item>}
          {actions.reveal && <Item icon={<FolderOpen size={14} />} onSelect={actions.reveal.run}>{actions.reveal.label}</Item>}
          {actions.clear && <Item icon={<X size={14} />} onSelect={actions.clear}>Clear from list</Item>}
          {actions.delete && (
            <>
              <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border-subtle" />
              <Item icon={<Trash size={14} />} destructive onSelect={actions.delete}>Delete</Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
