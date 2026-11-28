import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { SkillChip } from "@/components/harness/mentions/SkillChip";
import { AttachmentChip } from "@/components/markdown/AttachmentChip";
import { CheckedFileChip } from "@/components/markdown/CheckedFileChip";
import { LinkChip } from "@/components/markdown/LinkChip";
import { MD_COMPONENTS } from "@/components/markdown/MdComponents";
import { ReferenceLink } from "@/components/markdown/ReferenceLink";
import { splitLibraryPaths } from "@/lib/files/libraryPaths";
import { openCitation, openLibraryPath } from "@/lib/files/openFile";
import { parseLink } from "@/lib/harness/links";
import { hasMath, normalizeMath } from "@/lib/markdown/math";
import { rehypeMaths, useMathsReady } from "@/lib/maths";
import { openLink } from "@/lib/shell/tabRouters";
import { useSkillNames } from "@/stores/chat/skillStore";
import { remarkLineBreaks, remarkSkills } from "./questionRemark";

const MATHS = [rehypeMaths];
const NO_PLUGINS: never[] = [];

/**
 * A sent message's words as markdown, into the bubble's `.md-compact` box:
 * emphasis, lists, tables, code and maths as a reply draws them, typed line
 * breaks kept, and the composer's chips where the message names a file, an
 * attachment, a link or a picked skill. A fence is only ever code: no
 * diagram, widget or generated UI is drawn from what the student typed.
 */
export const QuestionMd = memo(function QuestionMd({
  text,
  onPicture,
}: {
  text: string;
  /** Opens an attached picture (data-directory-relative) in the lightbox. */
  onPicture: (path: string) => void;
}) {
  useMathsReady();
  const skills = useSkillNames();
  const math = hasMath(text);
  const remark = useMemo(
    () => [remarkGfm, ...(math ? [remarkMath] : []), [remarkSkills, skills] as [typeof remarkSkills, typeof skills], remarkLineBreaks],
    [math, skills],
  );
  const components = useMemo(() => questionComponents(onPicture), [onPicture]);
  return (
    <ReactMarkdown remarkPlugins={remark} rehypePlugins={math ? MATHS : NO_PLUGINS} components={components}>
      {math ? normalizeMath(text) : text}
    </ReactMarkdown>
  );
});

const Code = MD_COMPONENTS.code as (p: any) => React.ReactNode;

/** A link's words when they are plain text, else null. */
function plainText(children: unknown): string | null {
  if (typeof children === "string") return children;
  return Array.isArray(children) && children.every((c) => typeof c === "string") ? children.join("") : null;
}

function questionComponents(onPicture: (path: string) => void): Components {
  return {
    ...MD_COMPONENTS,
    // A fence that is wholly a path is the chip the composer drew
    // (`splitLibraryPaths`, the rule it shares); any other span is code.
    code: ({ className, children, ...p }: any) => {
      const span = String(children);
      if (!/language-/.test(className ?? "") && !span.includes("\n")) {
        const part = splitLibraryPaths(`\`${span}\``)[0];
        if (part?.kind === "image") return <AttachmentChip path={part.raw} onOpen={() => onPicture(part.path)} />;
        // A PDF or text file opens in the system's viewer.
        if (part?.kind === "attachment") return <AttachmentChip path={part.raw} onOpen={() => openLibraryPath(part.path)} />;
        if (part?.kind === "path")
          return <CheckedFileChip path={part.path} cite={part.cite} onClick={(newTab) => openCitation(part.cite, newTab)} />;
      }
      return (
        <Code className={className} {...p}>
          {children}
        </Code>
      );
    },
    pre: ({ children }: any) => <pre className="my-3">{children}</pre>,
    a: ({ href, children }: any) => {
      const words = plainText(children);
      if (typeof href === "string" && /^https?:\/\//.test(href) && words != null) {
        const raw = /^https?:\/\//.test(words) ? href : `[${words}](${href})`;
        if (parseLink(raw)) return <LinkChip raw={raw} onClick={(newTab) => void openLink(href, newTab)} />;
      }
      return <ReferenceLink href={href}>{children}</ReferenceLink>;
    },
    ...({ "skill-chip": (p: any) => <SkillChip name={p.name} /> } as Components),
  };
}
