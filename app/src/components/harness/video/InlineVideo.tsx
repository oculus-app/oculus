import { useEffect } from "react";
import { SidebarSimple } from "@phosphor-icons/react";

import { ControlButton } from "@/components/media/player/ControlButton";

import { VideoPlayer } from "@/components/studio/video/VideoPlayer";
import { useVideoPlayback } from "@/hooks/studio/useVideoPlayback";
import type { RenderPreset } from "@/lib/studio/render";
import type { VideoDetail } from "@/lib/studio/videos";

/** Where to play from; a new `n` asks again for the same second. */
export interface PlayRequest {
  at: number;
  n: number;
}

/**
 * A video's render playing inside the chat: the app's media player
 * with no dock, sharing the app's one sound (`useLibraryPlayback`). Mounted
 * by a Play press, it starts at `request.at`; unmounting pauses it, so a row
 * scrolled out of the window leaves nothing playing.
 */
export function InlineVideo({
  detail,
  request,
  preset = null,
  onOpenBeside,
}: {
  detail: VideoDetail;
  request: PlayRequest;
  /** That render rather than the newest. */
  preset?: RenderPreset | null;
  /** The control bar's button that opens the video's page beside the chat. */
  onOpenBeside?: () => void;
}) {
  const playback = useVideoPlayback(detail, false, preset);
  const { el } = playback;
  const { at, n } = request;
  useEffect(() => {
    if (!el) return;
    const play = () => {
      el.currentTime = at;
      // A pause before playback starts rejects with AbortError, which is no fault.
      el.play().catch((e) => e?.name !== "AbortError" && console.error("inline video play failed", e));
    };
    if (el.readyState >= 1) play();
    else el.addEventListener("loadedmetadata", play, { once: true });
    return () => el.removeEventListener("loadedmetadata", play);
  }, [el, at, n]);
  useEffect(() => (el ? () => el.pause() : undefined), [el]);
  return (
    <VideoPlayer
      playback={playback}
      controls={
        onOpenBeside && (
          <ControlButton label="Open beside the chat" onClick={onOpenBeside}>
            <SidebarSimple size={16} className="scale-x-[-1]" />
          </ControlButton>
        )
      }
    />
  );
}
