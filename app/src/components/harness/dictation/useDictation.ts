import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabActive } from "@/components/tabs/TabContext";
import { dictationCleanupStatus } from "@/lib/dictation/cleanup";
import type { DictationUsage, GroqReading } from "@/lib/dictation/groqUsage";
import { recordVoice, type Recording } from "@/lib/dictation/recording";

type Phase = "idle" | "starting" | "recording" | "transcribing" | "cleaning" | "error";

/** `Dictated`: a step's text and, when Groq answered it, Groq's reading. */
interface Dictated {
  text: string;
  groqUsage?: GroqReading;
}

/** Results belong to the draft that started them; cancelled work never inserts text. */
export function useDictation(draftKey: string, onInsert: (text: string) => void) {
  const active = useTabActive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  // The last cleanup failed because no cleanup engine is set up.
  const [unconfigured, setUnconfigured] = useState(false);
  const [raw, setRaw] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  // Groq's allowance as this dictation's Groq answers left it; null when
  // Groq did no part of it. Cleared by the next dictation, a send or ×.
  const [usage, setUsage] = useState<DictationUsage | null>(null);
  const generation = useRef(0);
  const recording = useRef<Recording | null>(null);
  const audio = useRef<Blob | null>(null);
  const pending = useRef(false);
  const currentKey = useRef(draftKey);
  currentKey.current = draftKey;
  const insert = useRef(onInsert);
  insert.current = onInsert;

  useEffect(() => {
    setPhase("idle");
    setRaw("");
    setError(null);
    setSetup(false);
    setUnconfigured(false);
    setAnalyser(null);
    setUsage(null);
    return () => {
      generation.current++;
      recording.current?.cancel();
      recording.current = null;
      audio.current = null;
      pending.current = false;
    };
  }, [draftKey]);

  const valid = (id: number) => generation.current === id && currentKey.current === draftKey;
  const fail = (cause: unknown) => {
    setError(String(cause instanceof Error ? cause.message : cause));
    setPhase("error");
    pending.current = false;
  };
  /** Drop the work in hand; `keepUsage` leaves the Groq line up. */
  const reset = useCallback((keepUsage: boolean) => {
    generation.current++;
    recording.current?.cancel();
    recording.current = null;
    audio.current = null;
    pending.current = false;
    setPhase("idle");
    setRaw("");
    setError(null);
    setUnconfigured(false);
    setAnalyser(null);
    if (!keepUsage) setUsage(null);
  }, []);
  const cancel = useCallback(() => reset(false), [reset]);
  const clearUsage = useCallback(() => setUsage(null), []);

  useEffect(() => {
    if (!active && (phase === "recording" || phase === "starting")) cancel();
  }, [active, phase, cancel]);

  const clean = async (transcript: string, id: number) => {
    setPhase("cleaning");
    setUnconfigured(false);
    let cleaned: string;
    try {
      const result = await invoke<Dictated>("dictation_cleanup", { transcript });
      cleaned = result.text;
      const reading = result.groqUsage;
      if (reading && valid(id)) setUsage((u) => ({ ...u, cleanup: reading }));
    } catch (cause) {
      // Read-only: says whether neither Groq nor S1-mini is set up.
      const status = await dictationCleanupStatus().catch(() => null);
      if (valid(id)) setUnconfigured(status?.engine === "none");
      throw cause;
    }
    if (!valid(id)) return;
    if (!cleaned.trim()) throw new Error("The cleanup model returned no text. Your transcript is still available.");
    insert.current(cleaned);
    audio.current = null;
    pending.current = false;
    setRaw("");
    setPhase("idle");
  };

  const transcribe = async (clip: Blob, id: number) => {
    setPhase("transcribing");
    const bytes = Array.from(new Uint8Array(await clip.arrayBuffer()));
    if (!valid(id)) return;
    const { text: transcript, groqUsage: reading } = await invoke<Dictated>("dictation_transcribe", { audio: bytes });
    if (!valid(id)) return;
    if (reading) setUsage((u) => ({ ...u, transcription: reading }));
    setRaw(transcript);
    await clean(transcript, id);
  };

  const finish = async () => {
    const capture = recording.current;
    if (!capture) return;
    recording.current = null;
    const id = generation.current;
    setPhase("transcribing");
    setAnalyser(null);
    try {
      const clip = await capture.finish();
      if (!valid(id)) return;
      audio.current = clip;
      if (!clip.size) throw new Error("No audio was recorded. Try dictating again.");
      await transcribe(clip, id);
    } catch (cause) { if (valid(id)) fail(cause); }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (seconds >= 600) void finishRef.current();
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  const start = async () => {
    if (pending.current) return;
    pending.current = true;
    const id = ++generation.current;
    setError(null); setRaw(""); setUsage(null); audio.current = null; setElapsed(0); setPhase("starting");
    try {
      try { await invoke("dictation_status"); }
      catch (cause) {
        if (valid(id)) { setSetupError(String(cause)); setSetup(true); setPhase("idle"); pending.current = false; }
        return;
      }
      if (!valid(id)) return;
      // Loads S1-mini while the student speaks; a no-op when Groq cleans.
      // A failure here resurfaces from the cleanup itself.
      void invoke("dictation_warm").catch(() => {});
      const capture = await recordVoice();
      if (!valid(id)) { capture.cancel(); return; }
      recording.current = capture; setAnalyser(capture.analyser); setPhase("recording");
    } catch (cause) { if (valid(id)) fail(cause); }
  };

  const retry = async () => {
    if (pending.current) return;
    pending.current = true; setError(null);
    const id = ++generation.current;
    try {
      if (raw) await clean(raw, id);
      else if (audio.current) await transcribe(audio.current, id);
      else { pending.current = false; void start(); }
    } catch (cause) { if (valid(id)) fail(cause); }
  };

  /** The setup dialog over a cleanup that failed for want of an engine. */
  const openCleanupSetup = () => { setSetupError(null); setSetup(true); };

  return {
    phase, error, setup, setupError, raw, elapsed, analyser, unconfigured,
    /** Shown once the dictation has settled, never over its strip or error. */
    usage: phase === "idle" ? usage : null,
    busy: phase !== "idle" && phase !== "error",
    canRetry: !!raw || !!audio.current,
    start, finish, cancel, retry, setSetup, openCleanupSetup, clearUsage,
    useTranscript: () => { if (raw) insert.current(raw); reset(true); },
  };
}

export type Dictation = ReturnType<typeof useDictation>;
