import { useCallback, useEffect, useRef, useState } from "react";

import { useLibraryPlayback } from "@/components/media/player/useLibraryPlayback";
import { useTabActive } from "@/components/tabs/TabContext";
import { mediaSrc } from "@/lib/lectures/media";

/**
 * One narration clip at a time from a hidden `<audio>`: `toggle(i, path)`
 * plays scene `i`'s clip, stops it when it is the one playing, or switches
 * to it from another. The element shares the app's one sound
 * (`useLibraryPlayback`), so it pauses a playing render or lecture and is
 * paused by them; any pause, the clip's end or unmounting clears `playing`.
 * `version` busts the media server's cache when the clips are re-narrated.
 */
export function useNarrationClip(version: number | null) {
  const [el, setEl] = useState<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const ask = useRef(0);
  /** A switch is in flight: its own pause of the old clip is no stop. */
  const switching = useRef(false);
  useLibraryPlayback(el, useTabActive());

  useEffect(() => {
    if (!el) return;
    const stop = () => {
      if (!switching.current) setPlaying(null);
    };
    el.addEventListener("pause", stop);
    el.addEventListener("ended", stop);
    return () => {
      el.removeEventListener("pause", stop);
      el.removeEventListener("ended", stop);
      ask.current++;
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [el]);

  const toggle = useCallback(
    (index: number, path: string) => {
      if (!el) return;
      const n = ++ask.current;
      if (playing === index) {
        switching.current = false;
        el.pause();
        setPlaying(null);
        return;
      }
      switching.current = true;
      el.pause();
      setPlaying(index);
      void mediaSrc(path)
        .then((src) => {
          if (n !== ask.current) return;
          el.src = `${src}&v=${version ?? 0}`;
          return el.play();
        })
        .then(() => {
          if (n === ask.current) switching.current = false;
        })
        .catch((e) => {
          // A pause before playback starts rejects with AbortError, which is no fault.
          if (e?.name !== "AbortError") console.error("narration clip play failed", e);
          if (n !== ask.current) return;
          switching.current = false;
          setPlaying(null);
        });
    },
    [el, playing, version],
  );

  return { ref: setEl, playing, toggle };
}
