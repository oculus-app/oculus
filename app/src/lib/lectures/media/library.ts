/** Library media's own elements (`VideoFileViewer`, Studio's players and
 *  narration clips), so a lecture or other library media starting can
 *  silence them; the lecture's are `lib/lectures/playback/`'s. */
const libraryVideos = new Set<HTMLMediaElement>();

export function registerLibraryVideo(v: HTMLMediaElement): () => void {
  libraryVideos.add(v);
  return () => void libraryVideos.delete(v);
}

/** Pause every library video but `except`. */
export function pauseLibraryVideos(except?: HTMLMediaElement) {
  for (const v of libraryVideos) if (v !== except && !v.paused) v.pause();
}
