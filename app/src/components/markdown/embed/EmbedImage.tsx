import { useState } from "react";
import { ImageLightbox } from "@/components/ui/lightbox/Lightbox";
import { useChatSaveScope } from "@/components/harness/save/ChatSaveScope";
import { SaveToDriveAction } from "@/components/harness/save/SaveToDriveAction";
import { useDataDir } from "@/hooks/backend/useDataDir";
import { attachmentSrc } from "@/lib/harness/attachments";
import { inAgentsDir } from "@/lib/files/statePaths";
import { basename, sourceOf } from "@/components/markdown/embed/shared";

/** Shows the action while the picture or its line is hovered or focused. */
const REVEAL = "group-hover/embed:opacity-100 group-focus-within/embed:opacity-100";

export function EmbedImage({ path, alt, suffix = "" }: { path: string; alt?: string; suffix?: string }) {
  const dataDir = useDataDir();
  const src = dataDir ? attachmentSrc(dataDir, path) + suffix : "";
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const label = alt || basename(path);
  // In a chat, a picture the agent made keeps a line under it for Save to
  // Drive… from the start, so the action's answer never moves the reply.
  const savable = !!useChatSaveScope() && inAgentsDir(path);

  // The alt or filename, never WebKit's broken-image glyph.
  if (broken)
    return (
      <span data-md={sourceOf(path + suffix, alt)} title={path} className="text-muted-foreground">
        {label}
      </span>
    );

  return (
    <span
      data-md={sourceOf(path + suffix, alt)}
      className={savable ? "group/embed my-3 flex w-fit max-w-full flex-col" : "my-3 block"}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${label}`}
        className="block max-w-full cursor-zoom-in"
      >
        {/* Not until the data dir resolves: an empty `src` fires `error`. */}
        {src && (
          <img
            src={src}
            alt={alt ?? ""}
            title={path}
            onError={() => setBroken(true)}
            className="block max-h-80 w-auto max-w-full rounded-lg border border-border"
          />
        )}
      </button>
      {savable ? (
        <span data-copy-skip className="mt-1 flex h-7 min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{alt}</span>
          <SaveToDriveAction path={path} look="caption" reveal={REVEAL} className="-mr-2" />
        </span>
      ) : (
        alt && <span className="mt-1.5 block text-xs text-muted-foreground">{alt}</span>
      )}
      <ImageLightbox
        src={src}
        alt={alt}
        open={open}
        onOpenChange={setOpen}
        actions={savable && <SaveToDriveAction path={path} look="toolbar" />}
      />
    </span>
  );
}
