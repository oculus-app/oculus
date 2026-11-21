import { Microphone, Palette, Timer } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { useSubjects } from "@/hooks/data/useSubjects";
import { displayCode } from "@/lib/format/format";
import { fmtClockSecs } from "@/lib/lectures/media";
import { subjectCodeFor } from "@/lib/studio/subjectCode";
import type { VideoDetail } from "@/lib/studio/videos";

/** A video's subject, theme, voice, length and shape as quiet pills. */
export function VideoFacts({ detail }: { detail: VideoDetail }) {
  const { row } = detail;
  const last = detail.scenes[detail.scenes.length - 1];
  const length = last?.start != null && last.duration != null ? last.start + last.duration : null;
  const portrait = detail.height > detail.width;
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.subject && <SubjectFact course={row.subject} />}
      <Fact icon={Palette}>{detail.theme}</Fact>
      {detail.voice && <Fact icon={Microphone}>{detail.voice}</Fact>}
      {length != null && <Fact icon={Timer}>{fmtClockSecs(length)}</Fact>}
      <Fact>
        {portrait ? "Reels" : "Video"} · {detail.width}×{detail.height} · {detail.fps} fps
      </Fact>
    </div>
  );
}

/** The subject as the app names it: its icon and display code. */
function SubjectFact({ course }: { course: string }) {
  const { subjects } = useSubjects();
  const code = subjectCodeFor(subjects, course);
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
