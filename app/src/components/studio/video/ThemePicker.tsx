import { useState } from "react";
import { Palette } from "@phosphor-icons/react";

import { ThemeList } from "@/components/studio/style/ThemeList";
import { PickerLabel, PickerPill } from "@/components/studio/video/PickerPill";
import { reloadExportStatus } from "@/hooks/studio/useExportStatus";
import { useSubjectCode } from "@/hooks/studio/useSubjectCode";
import { useThemeDefaults } from "@/hooks/studio/useThemeDefaults";
import { useThemes } from "@/hooks/studio/useThemes";
import { setVideoTheme, type VideoDetail } from "@/lib/studio/videos";
import { useVideosStore } from "@/stores/studio/videosStore";

/**
 * The theme fact as a picker: the themes in effect for the video's subject,
 * the current one marked. A press saves it at once and closes; the renders
 * then read as out of date. A theme video.json names by path shows as
 * written, with no row marked.
 */
export function ThemePicker({
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
  return (
    <PickerPill
      icon={Palette}
      label={detail.theme}
      ariaLabel={`Theme: ${detail.theme}`}
      blocker={blocker}
      open={open}
      onOpenChange={setOpen}
    >
      <ThemeChoices
        detail={detail}
        onSaved={() => {
          setOpen(false);
          onChanged();
        }}
      />
    </PickerPill>
  );
}

function ThemeChoices({ detail, onSaved }: { detail: VideoDetail; onSaved: () => void }) {
  const { dir, slug, subject: course } = detail.row;
  // The theme commands take the full subject code, not the video's course code.
  const code = useSubjectCode(course ?? "");
  const subject = course ? code : null;
  const themes = useThemes(subject);
  const { defaults } = useThemeDefaults(subject);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (name: string) => {
    if (name === detail.theme) return onSaved();
    setSaving(true);
    setError(null);
    try {
      await setVideoTheme(slug, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
    reloadExportStatus(dir);
    // The grid's thumbnail is keyed by the list's modified time.
    void useVideosStore.getState().reload();
  };

  const defaultTheme = defaults?.effective ?? null;
  return (
    <div>
      <PickerLabel>Theme</PickerLabel>
      <fieldset disabled={saving} className="min-w-0">
        <ThemeList
          state={themes}
          value={detail.theme}
          defaultTheme={defaultTheme}
          offerDefault={false}
          // ThemeList gives null for the default row; a video stores the name.
          onChange={(theme) => {
            const name = theme ?? defaultTheme;
            if (name) void pick(name);
          }}
        />
      </fieldset>
      {themes.loading && themes.themes.length === 0 && (
        <p className="px-2 py-1 text-[12px] text-muted-foreground">Reading the themes…</p>
      )}
      {error && <p className="px-2 py-1 text-[12px] leading-snug text-destructive">{error}</p>}
    </div>
  );
}
