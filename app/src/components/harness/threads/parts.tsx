import { FilmSlate } from "@phosphor-icons/react";
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

/** A film glyph on a thread making a Studio video, beside its title as a
 *  lecture thread's camera is. */
export function VideoGlyph({ threadId, size, className }: { threadId: number; size: number; className?: string }) {
  const makes = useVideosStore((s) => s.videos.some((v) => v.threadId === threadId));
  return makes ? <FilmSlate size={size} className={cn("shrink-0 text-muted-foreground", className)} aria-label="Makes a video" /> : null;
}
