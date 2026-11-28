import type { Subject } from "@/lib/db";
import { homeOf } from "@/lib/drive/home";
import { subjectRel } from "@/lib/files/libraryLayout";
import { parentRel } from "@/lib/drive/paths";
import type { FolderListing } from "@/lib/drive/listing";

/**
 * Where the Save dialog's In Drive puts a download until the student picks
 * another folder: the subject the tab's page belongs to (`guessSubject`),
 * else the last folder any Drive picker confirmed, else the top level.
 */
export function defaultDestination(guess: string | null, last: string | null): string {
  return guess ? subjectRel(guess) : (last ?? "");
}

/**
 * `rel`, or the nearest folder above it a download can land in: one that
 * is gone, synced or the folder of subjects steps up, and the top level
 * always takes one.
 */
export async function settleDestination(
  rel: string,
  list: (rel: string) => Promise<Pick<FolderListing, "rel" | "writable">>,
): Promise<string> {
  for (let at = rel; at; at = parentRel(at)) {
    try {
      if ((await list(at)).writable) return at;
    } catch {
      // Gone or unreadable: try the folder above.
    }
  }
  return "";
}

/** Why a download may not land in `dir`, or null: a folder in `courses/` of
 *  no subject Oculus knows has no home, so the file would get no row. */
export function landingProblem(dir: string, subjects: readonly Subject[]): string | null {
  return homeOf(dir, subjects) ? null : "That folder belongs to no subject Oculus knows.";
}
