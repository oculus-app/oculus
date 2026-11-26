import { Timer } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { ThemePicker } from "@/components/studio/video/ThemePicker";
import { VoicePicker } from "@/components/studio/video/VoicePicker";
import type { NarrationRead } from "@/hooks/studio/useNarrationStatus";
import { useSubjectCode } from "@/hooks/studio/useSubjectCode";
import { displayCode } from "@/lib/format/format";
import { fmtClockSecs } from "@/lib/lectures/media";
import { pillBlocker } from "@/lib/studio/videoControls";
import type { VideoDetail } from "@/lib/studio/videos";
import { useNarrateStore } from "@/stores/studio/narrateStore";
import { useRenderStore } from "@/stores/studio/renderStore";

/** A video's subject, theme, voice, length and shape as quiet pills; the
 *  theme and voice open pickers, off while anything writes into the folder. */
export function VideoFacts({
  detail,
  narration,
  running,
  onChanged,
}: {
  detail: VideoDetail;
  narration: NarrationRead;
  /** The video's thread is running a turn. */
  running: boolean;
  /** Re-reads the video after a picker changes it. */
  onChanged: () => void;
}) {
  const { row } = detail;
  const rendering = useRenderStore((s) => row.dir in s.active);
  const narrating = useNarrateStore((s) => row.dir in s.active);
  const blocker = pillBlocker({ rendering, narrating, running });
  const last = detail.scenes[detail.scenes.length - 1];
  const length = last?.start != null && last.duration != null ? last.start + last.duration : null;
  const portrait = detail.height > detail.width;
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.subject && <SubjectFact course={row.subject} />}
      <ThemePicker detail={detail} blocker={blocker} onChanged={onChanged} />
      <VoicePicker detail={detail} narration={narration} blocker={blocker} onChanged={onChanged} />
      {length != null && <Fact icon={Timer}>{fmtClockSecs(length)}</Fact>}
      <Fact>
        {portrait ? "Reels" : "Video"} · {detail.width}×{detail.height} · {detail.fps} fps
      </Fact>
    </div>
  );
}

/** The subject as the app names it: its icon and display code. */
function SubjectFact({ course }: { course: string }) {
  const code = useSubjectCode(course);
  return <Fact glyph={<SubjectIcon code={code} size={12} className="shrink-0" />}>{displayCode(code)}</Fact>;
}

function Fact({ icon: FactIcon, glyph, children }: { icon?: Icon; glyph?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex h-6 items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 text-[11.5px] text-muted-foreground">
      {glyph ?? (FactIcon && <FactIcon size={12} className="shrink-0" />)}
      <span className="whitespace-nowrap tabular-nums">{children}</span>
    </span>
  );
}
