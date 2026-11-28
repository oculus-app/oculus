import { invoke } from "@tauri-apps/api/core";

// The saved lexicons (`app/src-tauri/src/studio/commands/`): the global
// library's `studio/library/lexicon.json` and each subject's
// `studio/subjects/<CODE>/lexicon.json`. Every write is checked first and
// logged to the pronunciation history (`pronunciationHistory`). The check
// and the sample run on this computer, never a billed call.

/** Mirrors one key of a lexicon.json (keys starting `_` are comments, skipped). */
export interface LexiconEntry {
  /** A subject's course code, or null for the global library's lexicon. */
  subject: string | null;
  word: string;
  /** The value as stored: a respelling ("SOFT-max") or "/phonemes/". */
  reading: string;
  /** The phonemes the reading resolves to, or null when it does not check. */
  phonemes: string | null;
  /** The check's sentence when the reading does not check, else null. */
  error: string | null;
  /** A subject's entry for a word the global lexicon also has, which this
   *  one overrides for that subject. */
  overrides: boolean;
}

/** Every entry: the global lexicon's first, then each subject's by code,
 *  each file's in file order. Rejects with a sentence naming a file that is
 *  not a JSON object. */
export function lexiconList(): Promise<LexiconEntry[]> {
  return invoke<LexiconEntry[]>("studio_lexicon_list");
}

/** Checks the reading, then writes the word into that lexicon (logged as
 *  added or edited); rejects with the check's sentence. */
export function setLexiconEntry(subject: string | null, word: string, reading: string): Promise<LexiconEntry> {
  return invoke<LexiconEntry>("studio_lexicon_set", { subject, word, reading });
}

/** Deletes the word's key (logged as removed); rejects when it is not there. */
export function removeLexiconEntry(subject: string | null, word: string): Promise<void> {
  return invoke<void>("studio_lexicon_remove", { subject, word });
}

/** The word alone, pinned to `reading` over that subject's lexicon, in
 *  Settings -> Studio -> Narration's voice and speed, as WAV bytes. */
export function lexiconSample(subject: string | null, word: string, reading: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("studio_lexicon_sample", { subject, word, reading });
}

/** The phonemes `reading` resolves to; rejects with the check's sentence. */
export function checkLexiconReading(word: string, reading: string): Promise<string> {
  return invoke<string>("studio_lexicon_check", { word, reading });
}
