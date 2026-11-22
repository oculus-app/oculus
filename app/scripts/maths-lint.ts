// Replays the chat history through the reply's maths pipeline and lists every
// formula that would not render and every bit of TeX that renders as prose.
// `bun scripts/maths-lint.ts [--data <dir>] [--thread <id>] [--json]` reads the
// app's oculus.db read-only and exits 1 when it finds anything. Formulas go
// through KaTeX itself, which `app/math-core` ports.
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { parseArgs } from "node:util";
import katex from "katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { splitMaths } from "../src/components/markdown/genui/maths";
import { normalizeMath, restoreDollars } from "../src/lib/markdown/math";
import { dataDir } from "./studio-eval/paths";

type Finding = { thread: number; item: number; provider: string; kind: string; tex: string; error?: string };

const { values } = parseArgs({
  options: { data: { type: "string" }, thread: { type: "string" }, json: { type: "boolean" } },
});

/** TeX outside a formula: a command a reply only writes inside maths, or a bracket delimiter. */
const LEAK = /\\\(|\\\[|\\(?:frac|langle|rangle|alpha|beta|theta|psi|phi|sqrt|sum|int|mathbb|mathrm|cdot|otimes|lvert|rvert)\b/;
const UI = /```ui\n([\s\S]*?)```/g;

const reply = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

function check(tex: string, display: boolean): string | undefined {
  try {
    katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "ignore" });
  } catch (e) {
    return (e as Error).message;
  }
}

function lint(text: string): Omit<Finding, "thread" | "item" | "provider">[] {
  const out: Omit<Finding, "thread" | "item" | "provider">[] = [];
  visit(reply.parse(normalizeMath(text)), (node, _index, parent) => {
    if (node.type === "code" && node.lang === "ui") {
      // A `ui` block's maths sits in the text between its tags, never in an <svg>.
      const html = node.value.replace(/<svg[\s\S]*?<\/svg>/g, "");
      for (const run of html.split(/<[^>]+>/)) {
        for (const piece of run.includes("$") ? splitMaths(run).pieces : []) {
          if (!("tex" in piece)) continue;
          const error = check(piece.tex.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), piece.display);
          if (error) out.push({ kind: "ui formula", tex: piece.tex, error });
        }
      }
      return "skip";
    }
    if (node.type === "code" || node.type === "inlineCode") return "skip";
    if (node.type === "math" || node.type === "inlineMath") {
      const tex = restoreDollars(node.value);
      const error = check(tex, node.type === "math");
      if (error) out.push({ kind: "formula", tex, error });
      if (node.type === "math" && node.meta) out.push({ kind: "dropped after $$", tex: node.meta });
      return;
    }
    if (node.type === "text" && LEAK.test(node.value) && parent?.type !== "link") {
      out.push({ kind: "tex as prose", tex: node.value });
    }
  });
  return out;
}

const db = new Database(join(dataDir(values.data), "oculus.db"), { readonly: true });
const rows = db
  .query<{ id: number; thread_id: number; provider: string; content: string }, [number | null]>(
    `SELECT i.id, i.thread_id, t.provider, i.content FROM harness_items i
     JOIN harness_threads t ON t.id = i.thread_id
     WHERE i.kind = 'assistant' AND i.content IS NOT NULL AND (?1 IS NULL OR i.thread_id = ?1)
     ORDER BY i.id`,
  )
  .all(values.thread ? Number(values.thread) : null);

const findings: Finding[] = [];
for (const row of rows) {
  for (const f of lint(row.content)) findings.push({ thread: row.thread_id, item: row.id, provider: row.provider, ...f });
}

if (values.json) {
  console.log(JSON.stringify(findings, null, 1));
} else {
  for (const f of findings) {
    const tex = f.tex.replace(/\s+/g, " ").slice(0, 120);
    console.log(`thread ${f.thread} item ${f.item} (${f.provider}) ${f.kind}: ${tex}${f.error ? `\n    ${f.error.slice(0, 160)}` : ""}`);
  }
  console.log(`${rows.length} replies, ${findings.length} findings`);
}
process.exit(findings.length ? 1 : 0);
