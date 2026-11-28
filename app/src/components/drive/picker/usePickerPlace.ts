import { useCallback, useEffect, useRef, useState } from "react";
import { useFolderListing } from "@/hooks/drive/useFolderListing";
import { driveErrorText } from "@/lib/drive/commands";
import { listFolder, type FolderListing } from "@/lib/drive/listing";
import { parentRel } from "@/lib/drive/paths";
import { isPickerPlace, lastDestination, settleStart } from "@/lib/drive/picker";

/**
 * The folder the picker stands in. It opens on `start` (the last destination
 * when the caller names none), walked up to the nearest folder that exists
 * and that the picker shows, and follows the disk from there: a folder
 * deleted under it sends it up the same way. `place` keeps the last listing
 * drawn until the next one arrives, so opening a folder never blanks the
 * list; `settled` says it is the folder asked for.
 */
export function usePickerPlace(start: string | null | undefined) {
  const [rel, setRel] = useState<string | null>(null);
  const [place, setPlace] = useState<FolderListing | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const settle = useCallback((from: string) => {
    settleStart(from, listFolder).then(
      (listing) => live.current && setRel(listing.rel),
      (error) => live.current && setFailed(driveErrorText(error)),
    );
  }, []);

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (start != null) return settle(start);
    void lastDestination().catch(() => null).then((last) => live.current && settle(last ?? ""));
  }, [start, settle]);

  const { listing, error } = useFolderListing(rel);
  useEffect(() => {
    if (!listing) return;
    if (isPickerPlace(listing)) setPlace(listing);
    else settle(parentRel(listing.rel));
  }, [listing, settle]);
  // The hook keeps its error until a read succeeds, so only a new one counts.
  const at = useRef(rel);
  at.current = rel;
  useEffect(() => {
    if (error && at.current != null) settle(parentRel(at.current));
  }, [error, settle]);

  return { place, settled: !!place && place.rel === rel, go: setRel, failed };
}
