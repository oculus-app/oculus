import { getSetting, setSetting } from "@/lib/db";
import { DEFAULT_ENGINE_ORDER, type TranscribeEngine } from "./engines";

// Rust reads it at the start of every run (`settings_from` in
// `app/src-tauri/src/transcribe/settings/mod.rs`); the two parsers move together.

/** The model that tidies dictation, or `off` to insert it as heard. */
export type CleanupModel = "groq" | "s1Mini" | "off";

/** How dictation is tidied (`Choice` in
 *  `app/src-tauri/src/transcribe/cleanup/mod.rs`): the model, and whether
 *  the other one answers when it is not set up or fails. Stored as `cleanup`
 *  and `cleanupFallback`. */
export interface CleanupChoice {
  model: CleanupModel;
  fallback: boolean;
}

/** Groq with S1-mini behind it. */
export const DEFAULT_CLEANUP: CleanupChoice = { model: "groq", fallback: true };

/** Mirrors `Choice::from_setting`: a missing or unknown model (and `auto`,
 *  the default's older name) is Groq; a missing fallback is on for the
 *  default and off for a model stored by name. */
function parseCleanup(model: unknown, fallback: unknown): CleanupChoice {
  const stored = typeof fallback === "boolean" ? fallback : null;
  if (model === "off") return { model: "off", fallback: false };
  if (model === "groq" || model === "s1Mini") return { model, fallback: stored ?? false };
  return stored === null ? DEFAULT_CLEANUP : { model: "groq", fallback: stored };
}

export interface TranscribeSettings {
  /** Each engine once, in the order a run tries them. */
  order: TranscribeEngine[];
  /** `auto`, a locale such as `en_AU`, or a bare language code; null is the
   *  default, English in the Mac's region. */
  language: string | null;
  groq: { enabled: boolean };
  whisper: { enabled: boolean; model: string | null };
  apple: { enabled: boolean };
  cleanup: CleanupChoice;
}

const TRANSCRIBE_KEY = "transcribe";

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Known names in the stored order, each once, then any left out in the
 *  default order. */
function resolveOrder(stored: unknown): TranscribeEngine[] {
  const named = Array.isArray(stored) ? stored : [];
  const order: TranscribeEngine[] = [];
  for (const name of [...named, ...DEFAULT_ENGINE_ORDER]) {
    const engine = DEFAULT_ENGINE_ORDER.find((e) => e === name);
    if (engine && !order.includes(engine)) order.push(engine);
  }
  return order;
}

/**
 * The row as Rust reads it: a missing or mistyped value is its default — the
 * default order, every engine on, the default language, the picked model,
 * Groq tidying dictation with S1-mini as its fallback —
 * and without a top-level `language`, the older `apple.locale`, then
 * `whisper.language`, stands in for it.
 */
export function parseTranscribeSettings(row: Json): TranscribeSettings {
  const groq = object(row.groq);
  const whisper = object(row.whisper);
  const apple = object(row.apple);
  const enabled = (engine: Json) => (typeof engine.enabled === "boolean" ? engine.enabled : true);
  const language = text(row.language) ?? text(apple.locale) ?? text(whisper.language);
  return {
    order: resolveOrder(row.order),
    language: language?.toLowerCase() === "auto" ? "auto" : language,
    groq: { enabled: enabled(groq) },
    whisper: { enabled: enabled(whisper), model: text(whisper.model) },
    apple: { enabled: enabled(apple) },
    cleanup: parseCleanup(row.cleanup, row.cleanupFallback),
  };
}

/** The row as stored, unknown keys included, so a write keeps them. */
async function readTranscribeRow(): Promise<Json> {
  const raw = await getSetting(TRANSCRIBE_KEY);
  if (!raw) return {};
  try {
    return object(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function readTranscribeSettings(): Promise<TranscribeSettings> {
  return parseTranscribeSettings(await readTranscribeRow());
}

export interface TranscribeSettingsPatch {
  order?: TranscribeEngine[];
  language?: string;
  groq?: { enabled: boolean };
  whisper?: { enabled?: boolean; model?: string | null };
  apple?: { enabled: boolean };
  cleanup?: CleanupChoice;
}

/**
 * Read-modify-write of the whole row, so keys this side doesn't know survive.
 * A language is written only at the top level, and the older per-engine keys
 * it replaces are dropped with it.
 */
export async function writeTranscribeSettings(
  patch: TranscribeSettingsPatch,
): Promise<TranscribeSettings> {
  const row = await readTranscribeRow();
  const next: Json = { ...row };
  if (patch.order) next.order = resolveOrder(patch.order);
  if (patch.language !== undefined) {
    next.language = patch.language;
    const { locale: _, ...apple } = object(row.apple);
    const { language: __, ...whisper } = object(row.whisper);
    if ("apple" in row) next.apple = apple;
    if ("whisper" in row) next.whisper = whisper;
  }
  if (patch.cleanup) {
    next.cleanup = patch.cleanup.model;
    next.cleanupFallback = patch.cleanup.fallback;
  }
  for (const engine of ["groq", "whisper", "apple"] as const) {
    const part = patch[engine];
    if (part) next[engine] = { ...object(next[engine]), ...part };
  }
  await setSetting(TRANSCRIBE_KEY, JSON.stringify(next));
  return parseTranscribeSettings(next);
}
