import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Microphone } from "@phosphor-icons/react";

import { PickerLabel, PickerPill } from "@/components/studio/video/PickerPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reloadExportStatus } from "@/hooks/studio/useExportStatus";
import { kokoroVoiceLabel, kokoroVoicesStatus, type KokoroVoice } from "@/lib/studio/kokoroVoices";
import { narrationStatus, type NarrationStatus } from "@/lib/studio/narration";
import { initialVoiceChoice, narrateAction, type VoiceChoice } from "@/lib/studio/videoControls";
import { setVideoVoice, type VideoDetail } from "@/lib/studio/videos";
import { NARRATION_SETTINGS_HREF, readVoiceSettings } from "@/lib/studio/voice";
import { cn } from "@/lib/utils";
import { useNarrateStore } from "@/stores/studio/narrateStore";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The voice fact as a picker that narrates: the Settings voice first, then
 * Kokoro's downloaded voices (or a voice id for a TTS server). Choosing only
 * selects; the one button sets the voice and narrates, or narrates what is
 * stale. Nothing here synthesises until that button is pressed.
 */
export function VoicePicker({
  detail,
  blocker,
  onChanged,
}: {
  detail: VideoDetail;
  blocker: string | null;
  /** Re-reads the video. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = detail.voice ?? "No voice";
  return (
    <PickerPill
      icon={Microphone}
      label={label}
      ariaLabel={`Narration voice: ${label}`}
      blocker={blocker}
      open={open}
      onOpenChange={setOpen}
    >
      <VoiceChoices detail={detail} onClose={() => setOpen(false)} onChanged={onChanged} />
    </PickerPill>
  );
}

interface Read {
  status: NarrationStatus;
  /** The Settings voice; null when unset or unreadable. */
  settingsVoice: string | null;
}

function VoiceChoices({
  detail,
  onClose,
  onChanged,
}: {
  detail: VideoDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { dir, slug } = detail.row;
  const navigate = useNavigate();
  const [read, setRead] = useState<Read | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [voices, setVoices] = useState<KokoroVoice[] | null>(null);
  // Undefined until the status says which voice narrates now.
  const [choice, setChoice] = useState<VoiceChoice | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = useNarrateStore((s) => s.settled[dir] ?? 0);
  const picked = useRef(false);

  // Local reads only: the status, the saved settings and which voice files are on disk.
  useEffect(() => {
    let stale = false;
    Promise.all([narrationStatus(slug), readVoiceSettings().catch(() => null)])
      .then(([status, settings]) => {
        if (stale) return;
        const settingsVoice = settings?.voice ?? null;
        setRead({ status, settingsVoice });
        setReadError(null);
        // A re-read after a narration keeps what the student picked.
        if (picked.current) return;
        picked.current = true;
        const first = initialVoiceChoice(status, settingsVoice);
        setChoice(first);
        setDraft(first ?? "");
      })
      .catch((e) => !stale && setReadError(message(e)));
    return () => {
      stale = true;
    };
  }, [slug, settled]);

  const engine = read?.status.engine ?? null;
  useEffect(() => {
    if (engine !== "kokoro") return;
    let stale = false;
    kokoroVoicesStatus()
      .then((v) => !stale && setVoices(v))
      .catch(() => !stale && setVoices([]));
    return () => {
      stale = true;
    };
  }, [engine]);

  const name = (id: string) => voices?.find((v) => v.id === id)?.name ?? id;
  const action =
    read && choice !== undefined
      ? narrateAction({ choice, settingsVoice: read.settingsVoice, status: read.status, name })
      : null;

  const apply = async () => {
    if (!action || action.kind === "current") return;
    setBusy(true);
    setError(null);
    if (action.kind === "use") {
      try {
        await setVideoVoice(slug, action.voice);
      } catch (e) {
        setError(message(e));
        setBusy(false);
        return;
      }
      onChanged();
      reloadExportStatus(dir);
    }
    setBusy(false);
    onClose();
    if (action.kind === "narrate" || action.narrate) void useNarrateStore.getState().start(dir, slug);
  };

  const goSettings = () => {
    onClose();
    navigate(NARRATION_SETTINGS_HREF);
  };

  const downloaded = voices?.filter((v) => v.status === "present") ?? [];
  const own = read?.status.voice ?? null;
  // The video's own voice stays listed when its file is gone, so the mark shows.
  const ownMissing =
    engine === "kokoro" && own != null && own !== read?.settingsVoice && !downloaded.some((v) => v.id === own);

  return (
    <div>
      <PickerLabel>Voice</PickerLabel>
      {readError ? (
        <p className="px-2 py-1 text-[12px] leading-snug text-destructive">{readError}</p>
      ) : !read || choice === undefined ? (
        <p className="px-2 py-1 text-[12px] text-muted-foreground">Checking the narration…</p>
      ) : (
        <>
          <div role="listbox" aria-label="Voice" className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            <VoiceRow
              label={`Default · ${read.settingsVoice ?? "none set"}`}
              selected={choice === null}
              onPick={() => {
                setChoice(null);
                setDraft("");
              }}
            />
            {engine === "kokoro" && (
              <>
                {ownMissing && own && (
                  <VoiceRow label={name(own)} note="Not downloaded" selected={choice === own} onPick={() => setChoice(own)} />
                )}
                {downloaded.map((v) => (
                  <VoiceRow
                    key={v.id}
                    label={kokoroVoiceLabel(v)}
                    selected={choice === v.id}
                    onPick={() => setChoice(v.id)}
                  />
                ))}
                {voices === null && <p className="px-2 py-1 text-[12px] text-muted-foreground">Reading the voices…</p>}
              </>
            )}
          </div>
          {engine === "server" && (
            <div className="px-2 pb-1 pt-1.5">
              <Input
                aria-label="Voice ID"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setChoice(e.target.value.trim() || null);
                }}
                placeholder="Voice ID, such as af_heart"
                className="h-7 text-xs"
              />
            </div>
          )}
          {engine === "kokoro" && (
            <button
              type="button"
              data-tab-href={NARRATION_SETTINGS_HREF}
              onClick={goSettings}
              className="mx-2 mt-1 cursor-pointer text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              More voices in Settings
            </button>
          )}
          <div className="mt-1.5 space-y-1.5 border-t border-border-subtle px-2 pb-1 pt-2.5 text-[12px]">
            {read.status.problem && (
              <div className="flex items-start gap-2">
                <span role="alert" className="min-w-0 flex-1 leading-snug text-warning">
                  {read.status.problem}
                </span>
                <button
                  type="button"
                  data-tab-href={NARRATION_SETTINGS_HREF}
                  onClick={goSettings}
                  className="shrink-0 cursor-pointer text-brand underline-offset-2 hover:underline"
                >
                  Settings
                </button>
              </div>
            )}
            {action && action.kind !== "current" ? (
              <>
                <Button
                  size="sm"
                  className="w-full"
                  // A problem is the current voice's; another voice may not have it.
                  disabled={busy || (read.status.problem != null && action.kind !== "use")}
                  onClick={() => void apply()}
                >
                  {action.label}
                </Button>
                {engine === "server" && (action.kind === "narrate" || action.narrate) && (
                  <p className="text-[11.5px] leading-snug text-muted-foreground">Sends each scene to your TTS server.</p>
                )}
              </>
            ) : (
              !read.status.problem && <p className="text-muted-foreground">The narration is current.</p>
            )}
            {error && <p className="leading-snug text-destructive">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** A voice to choose, in the style chip's row look: the current one lit and ticked. */
function VoiceRow({
  label,
  note,
  selected,
  onPick,
}: {
  label: string;
  note?: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
        selected ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {note && <span className="shrink-0 text-[10.5px] text-muted-foreground">{note}</span>}
      <Check size={12} weight="bold" className={cn("shrink-0", !selected && "invisible")} />
    </button>
  );
}
