import { useEffect, useRef } from "react";
import { FilmSlate, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useVideosStore } from "@/stores/studio/videosStore";

/** Where a dragged Subject group would drop. */
export function DropLine({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-brand", className)}
    />
  );
}

/**
 * A row's armed delete. Focused on mount so clicking elsewhere blurs to cancel.
 * Both buttons commit on `mousedown`: WebKit doesn't focus a clicked button, so
 * pressing one blurs the focused confirm first, which unmounts this before a
 * `click` could land.
 */
export function ConfirmDelete({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Mount only, so a re-render never steals focus back.
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        ref={ref}
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onConfirm();
        }}
        onBlur={onCancel}
        /* No onClick for the keyboard to synthesise into, so keys are handled here. */
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onConfirm();
          }
        }}
        className="rounded px-1 text-[10.5px] text-destructive hover:bg-destructive/10"
      >
        {label}
      </button>
      <button
        type="button"
        aria-label="Keep thread"
        title="Keep"
        onMouseDown={(e) => {
          e.preventDefault();
          onCancel();
        }}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X size={11} weight="bold" />
      </button>
    </div>
  );
}

/** A film glyph on a thread making a Studio video, beside its title as a
 *  lecture thread's camera is. */
export function VideoGlyph({ threadId, size, className }: { threadId: number; size: number; className?: string }) {
  const makes = useVideosStore((s) => s.videos.some((v) => v.threadId === threadId));
  return makes ? <FilmSlate size={size} className={cn("shrink-0 text-muted-foreground", className)} aria-label="Makes a video" /> : null;
}
