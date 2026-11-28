import { splitSkillTokens } from "@/lib/harness/skills";

type MdNode = { type: string; value?: string; children?: MdNode[]; data?: Record<string, unknown> };

/** Every text node under `node` swapped for what `split` makes of it; code
 *  and maths carry `value`, not children, so they are never reached. */
function rewriteText(node: MdNode, split: (value: string) => MdNode[] | null): void {
  const kids = node.children;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    if (kid.type !== "text" || !kid.value) {
      rewriteText(kid, split);
      continue;
    }
    const parts = split(kid.value);
    if (!parts) continue;
    kids.splice(i, 1, ...parts);
    i += parts.length - 1;
  }
}

/** remark plugin: a `/name` word naming a skill in `known` becomes a
 *  `skill-chip` element, as a restored draft chips it (`splitSkillTokens`). */
export function remarkSkills(known: ReadonlySet<string> | null | undefined) {
  return (tree: MdNode) => {
    if (!known?.size) return;
    rewriteText(tree, (value) => {
      if (!value.includes("/")) return null;
      const parts = splitSkillTokens(value, known);
      if (!parts.some((p) => p.kind === "skill")) return null;
      return parts.map((p) =>
        p.kind === "text"
          ? { type: "text", value: p.text }
          : { type: "skill", data: { hName: "skill-chip", hProperties: { name: p.name } } },
      );
    });
  };
}

/** remark plugin: a line break typed inside a paragraph stays a line break,
 *  where CommonMark would fold it into a space. */
export function remarkLineBreaks() {
  return (tree: MdNode) =>
    rewriteText(tree, (value) => {
      if (!value.includes("\n")) return null;
      return value.split("\n").flatMap((line, i): MdNode[] => {
        const text: MdNode[] = line ? [{ type: "text", value: line }] : [];
        return i ? [{ type: "break" }, ...text] : text;
      });
    });
}
