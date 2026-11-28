import { memo, useMemo, type ComponentType, type ReactNode } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { middleTruncate } from "@/components/markdown/AttachmentChip";
import { toChunks } from "@/components/harness/mentions/dom";
import { SkillChip } from "@/components/harness/mentions/SkillChip";
import { parsedSourceOf } from "@/lib/citations";
import { fileIconFor } from "@/lib/files/fileTypes";
import { fileTitle, folderTitle } from "@/lib/files/labels";
import { pathFile } from "@/lib/files/pathCategory";
import { fileReferenceAppearance } from "@/lib/files/referenceAppearance";
import { attachmentPath } from "@/lib/harness/attachments";
import { parseLink } from "@/lib/harness/links";
import { cn } from "@/lib/utils";
import { useAttachmentLabel } from "@/stores/chat/attachmentNames";
import { useSkillNames } from "@/stores/chat/skillStore";

/**
 * One line of a message or draft as the composer draws it: a mention or an
 * attachment as its glyph and name, a `/name` the catalogue holds as a skill
 * chip, a link as its words. Display only, with no hover card and no click:
 * a list row is one hit target. The parent truncates.
 */
export const PreviewLine = memo(function PreviewLine({ text }: { text: string }) {
  const skills = useSkillNames();
  const chunks = useMemo(() => toChunks(text, skills ?? undefined), [text, skills]);
  return chunks.map((c, i) => {
    if (c.kind === "text") return c.text;
    if (c.kind === "skill") return <SkillChip key={i} name={c.name} />;
    if (c.kind === "chip") return <FileMark key={i} path={c.path} />;
    if (c.kind === "attachment") return <AttachmentMark key={i} path={c.path} />;
    return parseLink(c.raw)?.label ?? c.raw;
  });
});

/** A reference's glyph and name in the line's own colour, underlined as a
 *  composer mention is. */
function Mark({ icon: Icon, tone, children }: { icon: ComponentType<IconProps>; tone: string; children: ReactNode }) {
  return (
    <span className="mx-px inline whitespace-nowrap underline decoration-border underline-offset-[3px]">
      <Icon size="1.15em" aria-hidden className={cn("mr-[0.35em] inline align-[-0.18em]", tone)} />
      {children}
    </span>
  );
}

/** A library path, named as `FileChip` names it. */
function FileMark({ path }: { path: string }) {
  const file = pathFile(parsedSourceOf(path) ?? path);
  const { Icon, tone } = fileReferenceAppearance(file, path);
  return (
    <Mark icon={Icon} tone={tone}>
      {path.endsWith("/") ? folderTitle(path) : fileTitle(file)}
    </Mark>
  );
}

/** An attachment, named as `AttachmentChip` names it. */
function AttachmentMark({ path }: { path: string }) {
  const rel = attachmentPath(path) ?? path;
  const name = useAttachmentLabel(path);
  const { tone } = fileReferenceAppearance({ category: null, filename: rel });
  return (
    <Mark icon={fileIconFor(rel)} tone={tone}>
      {middleTruncate(name)}
    </Mark>
  );
}
