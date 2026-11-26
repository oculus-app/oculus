import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GearSix, Microphone } from "@phosphor-icons/react";

import { PICKER_ROW, PickerCheck, PickerPill } from "@/components/studio/video/PickerPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reloadExportStatus } from "@/hooks/studio/useExportStatus";
import type { NarrationRead } from "@/hooks/studio/useNarrationStatus";
import { kokoroVoicesStatus, type KokoroVoice } from "@/lib/studio/kokoroVoices";
import { setVideoVoice, type VideoDetail } from "@/lib/studio/videos";
import { NARRATION_SETTINGS_HREF } from "@/lib/studio/voice";
import { cn } from "@/lib/utils";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The voice fact as a picker, in the model menu's manner: Kokoro's
 * downloaded voices by name, the video's ticked, and a press saves it at
 * once and closes; a TTS server takes a typed voice id instead. Nothing here
 * narrates: the clips then read as out of date in the render bar, whose
 * Narrate does. A Kokoro voice reads by its name, on the pill too.
 */
export function VoicePicker({
  detail,
  narration,
  blocker,
  onChanged,
}: {
  detail: VideoDetail;
  narration: NarrationRead;
  blocker: string | null;
  /** Re-reads the video. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<KokoroVoice[] | null>(null);
  const { reload } = narration;
  // Which voice files are on disk, and the Settings voice, read again on each
  // open: both local.
  useEffect(() => {
    if (open) reload();
    let stale = false;
    kokoroVoicesStatus()
      .then((v) => !stale && setVoices(v))
      .catch(() => !stale && setVoices([]));
    return () => {
      stale = true;
    };
  }, [open, reload]);
  const name = (id: string) => voices?.find((v) => v.id === id)?.name ?? id;
  const label = detail.voice ? name(detail.voice) : "No voice";
  return (
    <PickerPill
      icon={Microphone}
      label={label}
      ariaLabel={`Narration voice: ${label}`}
      blocker={blocker}
      open={open}
      onOpenChange={setOpen}
    >
      <VoiceChoices
        detail={detail}
        narration={narration}
        voices={voices}
        name={name}
        onClose={() => setOpen(false)}
        onChanged={onChanged}
      />
    </PickerPill>
  );
}

function VoiceChoices({
  detail,
  narration,
  voices,
  name,
  onClose,
  onChanged,
}: {
  detail: VideoDetail;
  narration: NarrationRead;
  /** Kokoro's voices; null until read. */
  voices: KokoroVoice[] | null;
  /** How a voice id reads: a Kokoro voice's name, else the id. */
  name: (id: string) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { dir, slug } = detail.row;
  const navigate = useNavigate();
  const { status } = narration;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (voice: string | null) => {
    if (voice === current) return onClose();
    setSaving(true);
    setError(null);
    try {
      await setVideoVoice(slug, voice);
    } catch (e) {
      setError(message(e));
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
    onChanged();
    narration.reload();
    reloadExportStatus(dir);
  };

  const goSettings = () => {
    onClose();
    navigate(NARRATION_SETTINGS_HREF);
  };

  // The voice narrating now: the video's own, else the Settings voice.
  const current = status?.voice ?? detail.voice;
  if (!status) {
    return (
      <p className={cn("px-3 py-2.5 text-xs", narration.error ? "leading-snug text-destructive" : "text-muted-foreground")}>
        {narration.error ?? "Checking the narration…"}
      </p>
    );
  }

  const downloaded = voices?.filter((v) => v.status === "present") ?? [];
  // The video's voice stays listed when its file is gone, so the tick shows.
  const missing = status.engine === "kokoro" && current != null && voices != null && !downloaded.some((v) => v.id === current);
  return (
    <>
      {status.engine === "kokoro" && (
        <fieldset disabled={saving} className="min-w-0 p-1">
          <div role="listbox" aria-label="Voice" className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {missing && current && <VoiceRow label={name(current)} note="not downloaded" selected onPick={onClose} />}
            {downloaded.map((v) => (
              <VoiceRow
                key={v.id}
                label={v.name}
                note={v.gender}
                selected={v.id === current}
                onPick={() => void save(v.id)}
              />
            ))}
            {voices === null && <p className="px-2 py-1.5 text-xs text-muted-foreground">Reading the voices…</p>}
          </div>
        </fieldset>
      )}
      {status.engine === "server" && (
        <ServerVoice current={current} saving={saving} onSave={(voice) => void save(voice)} />
      )}
      {(status.problem || error) && (
        <p
          role="alert"
          className={cn("px-3 pb-2 pt-1 text-[11.5px] leading-snug", error ? "text-destructive" : "text-warning")}
        >
          {error ?? status.problem}
        </p>
      )}
      <div className="border-t border-border-subtle p-1">
        <button
          type="button"
          data-tab-href={NARRATION_SETTINGS_HREF}
          onClick={goSettings}
          className={cn(PICKER_ROW, "text-muted-foreground hover:text-foreground")}
        >
          <span className="min-w-0 truncate">
            {status.engine === "kokoro" ? "More voices in Settings" : "Narration settings"}
          </span>
          <GearSix className="ml-auto size-3.5 shrink-0" />
        </button>
      </div>
    </>
  );
}

/** A TTS server's voice: its id as typed, saved by Enter or Save. Empty goes
 *  back to the Settings voice. */
function ServerVoice({
  current,
  saving,
  onSave,
}: {
  current: string | null;
  saving: boolean;
  onSave: (voice: string | null) => void;
}) {
  const [draft, setDraft] = useState(current ?? "");
  const typed = draft.trim() || null;
  return (
    <form
      className="flex min-w-60 items-center gap-1.5 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(typed);
      }}
    >
      <Input
        aria-label="Voice ID"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Voice ID, such as af_heart"
        className="h-7 min-w-0 flex-1 text-xs"
      />
      <Button type="submit" variant="outline" size="xs" disabled={saving || typed === current}>
        Save
      </Button>
    </form>
  );
}

/** A voice to choose: its name, a quiet note after it, and the tick. */
function VoiceRow({
  label,
  note,
  selected,
  onPick,
}: {
  label: string;
  note: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button type="button" role="option" aria-selected={selected} onClick={onPick} className={PICKER_ROW}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{note}</span>
      <PickerCheck selected={selected} />
    </button>
  );
}
