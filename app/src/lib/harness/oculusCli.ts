import { displayCode, humanizeSlug } from "@/lib/format/format";
import { base, code, column, flag, isOculus, join, parseArgs, pathCourse, parseShell, shellCommands, unwrapShell } from "./cliArgs";
import { group, row, words, type CliEntry, type CliIcon, type Emphasis } from "./cliRow";
import { cliState, draftedCount, memoryWording, refusedWrite, type CliState } from "./cliResult";
import type { ToolMeta } from "./types";

export { shellCommands };
export type { CliIcon };

const first: Emphasis = a => a.pos[0];
const file: Emphasis = a => a.pos[0] && base(a.pos[0]);
const subject: Emphasis = a => code(flag(a, "-s", "--subject"));
const subjects: Emphasis = a => a.pos.map(displayCode).join(", ") || undefined;
const title: Emphasis = a => flag(a, "--title", "--name") ?? first(a);
const id: Emphasis = a => first(a) && `#${first(a)}`;
const memory: Emphasis = a => flag(a, "--about", "--description", "--title") ?? (a.pos[0] && humanizeSlug(a.pos[0]));
const bucket: Emphasis = a => a.flags.has("--all") ? "all subjects" : subject(a);
const scene: Emphasis = a => join(file(a), flag(a, "--scene"));
const member: Emphasis = a => a.pos[1];
const voices: Emphasis = a => a.flags.has("--all") ? "all voices" : a.pos.join(", ") || undefined;
const query: Emphasis = a => join(a.pos[0] && `"${a.pos[0]}"`, subject(a));
const libraryFile: Emphasis = a => {
  const pages = flag(a, "-p", "--pages");
  return join(file(a), pages && `p. ${pages}`, code(pathCourse(first(a) ?? "")) ?? subject(a));
};
const search = words("Searching", "Searched", "the library for", "the library {} times");
const memoryWriteResult = { ...words("Finishing", "Finished", "a memory write", "{} memory writes"),
  live: words("Writing", "Wrote", "a memory", "{} memories").live };
const question = words("Drafting", "Drafted", "a question", "{} questions");
const voiceList = words("Listing", "Listed", "Studio voices");

const fallback: CliEntry = {
  ...row("*", "library", words("Running", "Ran", "oculus", "{} oculus commands")),
  fallback: true,
};

export const cliRegistry: CliEntry[] = [
  row("status", "library", words("Checking", "Checked", "library status")),
  row("list", "library", a => words("Listing", "Listed", a.flags.has("-l") || a.flags.has("--lectures") ? "lectures" : "subjects"), subjects),
  row("run", "library", a => words("Syncing", "Synced", a.flags.has("--ed") ? "Ed" : a.flags.has("-l") || a.flags.has("--lectures") ? "lectures" : "Canvas"), subjects, true),
  row("index", "index", words("Indexing", "Indexed", "library files"), subjects, true),
  group("library", "library"),
  row("library migrate", "folder", a => a.flags.has("--dry-run") ? words("Previewing", "Previewed", "library migration") : words("Running", "Ran", "library migration"), undefined, true),
  row("search", "search", search, query),
  row("grep", "search", search, query),
  row("read", "file", words("Reading", "Read", "", "{} files"), libraryFile),
  row("files", "folder", words("Listing", "Listed", "files"), subjects),
  row("calendar", "calendar", words("Checking", "Checked", "the calendar"), subjects),
  group("project", "project"),
  row("project list", "project", words("Listing", "Listed", "projects"), subject),
  row("project show", "project", words("Opening", "Opened", "project", "{} projects"), id),
  row("project events", "calendar", words("Listing", "Listed", "linkable events"), subject),
  row("project create", "project", words("Creating", "Created", "project", "{} projects"), title, true),
  row("project update", "project", words("Updating", "Updated", "project", "{} projects"), title, true),
  group("task", "task"),
  row("task list", "task", words("Listing", "Listed", "tasks"), a => flag(a, "-p", "--project", "--tag")),
  row("task show", "task", words("Opening", "Opened", "task", "{} tasks"), id),
  row("task add", "task", a => a.flags.has("--batch") ? words("Adding", "Added", "a task batch", "{} task batches") : words("Adding", "Added", "a task", "{} tasks"), title, true),
  row("task update", "task", words("Updating", "Updated", "task", "{} tasks"), a => flag(a, "--title") ?? id(a), true),
  row("task move", "task", words("Moving", "Moved", "task to", "{} tasks to"), a => column(flag(a, "-c", "--column") ?? ""), true),
  row("task refile", "task", words("Refiling", "Refiled", "task", "{} tasks"), id, true),
  row("task rm", "task", words("Deleting", "Deleted", "task", "{} tasks"), id, true),
  group("tag", "tag"),
  row("tag list", "tag", words("Listing", "Listed", "tags")),
  row("tag add", "tag", words("Adding", "Added", "tag", "{} tags"), first, true),
  row("tag rename", "tag", words("Renaming", "Renamed", "tag", "{} tags"), a => a.pos.join(" → "), true),
  row("tag color", "tag", words("Recolouring", "Recoloured", "tag", "{} tags"), first, true),
  row("tag rm", "tag", words("Deleting", "Deleted", "tag", "{} tags"), first, true),
  group("memory", "memory"),
  row("memory list", "memory", words("Listing", "Listed", "memories"), bucket),
  row("memory read", "memory", words("Reading", "Read", "memory", "{} memories"), first),
  row("memory write", "memory", memoryWriteResult, memory, true),
  row("memory append", "memory", a => {
    if (!a.flags.has("--replace")) return words("Appending", "Appended", "a line to", "{} lines to");
    return a.pos[1]?.trim() ? words("Replacing", "Replaced", "a line in", "{} lines in")
      : words("Removing", "Removed", "a line from", "{} lines from");
  }, a => a.pos[0] && humanizeSlug(a.pos[0]), true),
  row("memory fold", "memory", words("Folding", "Folded", "memories into"), a => humanizeSlug(flag(a, "--into") ?? ""), true),
  row("memory rm", "memory", words("Deleting", "Deleted", "memory", "{} memories"), first, true),
  row("memory move", "memory", words("Moving", "Moved", "memory", "{} memories"), first, true),
  row("memory promote", "memory", words("Promoting", "Promoted", "memory to preferences"), first, true),
  row("memory reindex", "memory", words("Reindexing", "Reindexed", "memories"), bucket, true),
  group("lecture", "lecture"),
  row("lecture list", "lecture", words("Listing", "Listed", "recordings"), subject),
  row("lecture candidates", "lecture", words("Checking", "Checked", "chapter boundaries"), first),
  row("lecture chapters", "lecture", words("Checking", "Checked", "lecture chapters"), first, true),
  row("lecture end", "lecture", a => a.flags.has("--print-prompt") ? words("Reading", "Read", "lecture end prompt") : words("Checking", "Checked", "lecture endings"), a => a.flags.has("--all") ? "all lectures" : a.pos.join(", "), true),
  row("transcribe", "lecture", words("Transcribing", "Transcribed", "recording", "{} recordings"), file, true),
  group("cheat", "cheat"),
  row("cheat add", "cheat", words("Adding", "Added", "cheat sheet entry", "{} cheat sheet entries"), title, true),
  row("cheat list", "cheat", words("Listing", "Listed", "cheat sheet entries"), subject),
  row("cheat show", "cheat", words("Opening", "Opened", "cheat sheet entry", "{} cheat sheet entries"), first),
  row("cheat update", "cheat", words("Updating", "Updated", "cheat sheet entry", "{} cheat sheet entries"), title, true),
  row("cheat rm", "cheat", words("Deleting", "Deleted", "cheat sheet entry", "{} cheat sheet entries"), first, true),
  row("cheat tags", "tag", words("Listing", "Listed", "cheat sheet tags")),
  group("quiz", "quiz"),
  row("quiz add", "quiz", question, a => flag(a, "--prompt") ?? subject(a), true),
  row("quiz list", "quiz", a => words("Listing", "Listed", a.flags.has("--due") ? "due questions" : "questions"), subject),
  row("quiz show", "quiz", words("Opening", "Opened", "question", "{} questions"), first),
  row("quiz update", "quiz", words("Updating", "Updated", "question", "{} questions"), first, true),
  row("quiz rm", "quiz", words("Deleting", "Deleted", "question", "{} questions"), first, true),
  group("quiz set", "quiz"),
  row("quiz set add", "quiz", words("Creating", "Created", "quiz set", "{} quiz sets"), title, true),
  row("quiz set list", "quiz", words("Listing", "Listed", "quiz sets"), subject),
  row("quiz set show", "quiz", words("Opening", "Opened", "quiz set", "{} quiz sets"), first),
  row("quiz set update", "quiz", words("Updating", "Updated", "quiz set", "{} quiz sets"), first, true),
  group("artifact", "artifact"),
  row("artifact save", "artifact", words("Saving", "Saved", "revision artifact", "{} revision artifacts"), title, true),
  row("artifact update", "artifact", words("Updating", "Updated", "revision artifact", "{} revision artifacts"), first, true),
  row("artifact list", "artifact", words("Listing", "Listed", "revision artifacts"), subject),
  row("artifact show", "artifact", words("Opening", "Opened", "revision artifact", "{} revision artifacts"), first),
  row("artifact rm", "artifact", words("Deleting", "Deleted", "revision artifact", "{} revision artifacts"), first, true),
  group("topic", "topic"),
  row("topic add", "topic", words("Filing", "Filed", "revision topic", "{} revision topics"), title, true),
  row("topic list", "topic", words("Listing", "Listed", "revision topics"), subject),
  row("topic show", "topic", words("Opening", "Opened", "revision topic", "{} revision topics"), first),
  row("topic update", "topic", words("Updating", "Updated", "revision topic", "{} revision topics"), first, true),
  row("topic rm", "topic", words("Deleting", "Deleted", "revision topic", "{} revision topics"), first, true),
  group("widget", "widget"),
  row("widget check", "widget", words("Checking", "Checked", "widget", "{} widgets"), a => first(a) === "-" ? "stdin" : file(a)),
  group("studio", "studio"),
  row("studio new", "studio", words("Creating", "Created", "Studio video", "{} Studio videos"), title, true),
  row("studio list", "studio", words("Listing", "Listed", "Studio videos"), subject),
  row("studio title", "studio", words("Renaming", "Renamed", "Studio video", "{} Studio videos"), member, true),
  row("studio frame", "studio", words("Rendering", "Rendered", "a frame", "{} frames"), scene, true),
  row("studio strip", "studio", words("Rendering", "Rendered", "contact sheet", "{} contact sheets"), scene, true),
  row("studio lint", "studio", words("Checking", "Checked", "Studio scenes"), scene),
  row("studio brief", "studio", words("Reading", "Read", "scene brief", "{} scene briefs"), scene),
  row("studio beats", "studio", words("Reading", "Read", "scene timeline", "{} scene timelines"), scene),
  row("studio gallery", "studio", words("Rendering", "Rendered", "component gallery", "{} galleries"), member, true),
  row("studio slide", "studio", words("Preparing", "Prepared", "slide", "{} slides"), member, true),
  row("studio blocks", "file", words("Inspecting", "Inspected", "page blocks"), file),
  group("studio series", "studio"),
  row("studio series new", "studio", words("Creating", "Created", "video series", "{} video series"), title, true),
  row("studio series add", "studio", words("Adding", "Added", "series part", "{} series parts"), title, true),
  row("studio series show", "studio", words("Opening", "Opened", "video series", "{} video series"), first),
  row("studio series recap", "studio", words("Reading", "Read", "the recap of", "{} series recaps"), first),
  group("studio components", "studio"),
  row("studio components list", "studio", words("Listing", "Listed", "Studio components"), file),
  row("studio components show", "studio", words("Opening", "Opened", "Studio component", "{} Studio components"), member),
  row("studio components promote", "studio", words("Promoting", "Promoted", "Studio component", "{} Studio components"), member, true),
  row("studio components seed", "studio", words("Installing", "Installed", "Studio starters"), undefined, true),
  group("studio themes", "studio"),
  row("studio themes promote", "studio", words("Promoting", "Promoted", "Studio theme", "{} Studio themes"), member, true),
  row("studio render", "studio", words("Rendering", "Rendered", "video", "{} videos"), file, true),
  row("studio narrate", "voice", words("Preparing", "Prepared", "narration"), file, true),
  row("studio tts", "voice", words("Generating", "Generated", "speech clip", "{} speech clips"), first, true),
  row("studio g2p", "voice", words("Checking", "Checked", "pronunciation"), first),
  group("studio pronounce", "voice"),
  row("studio pronounce suggest", "voice", words("Suggesting", "Suggested", "pronunciation for"), member, true),
  row("studio pronounce list", "voice", words("Listing", "Listed", "pronunciation suggestions"), a => flag(a, "--video")),
  { ...row("studio voices", "voice", voiceList), group: true },
  row("studio voices list", "voice", voiceList),
  row("studio voices download", "voice", words("Downloading", "Downloaded", "voice assets"), voices, true),
  row("studio voices delete", "voice", words("Removing", "Removed", "voice assets"), voices, true),
  group("studio aligner", "voice"),
  row("studio aligner status", "voice", words("Checking", "Checked", "narration aligner")),
  row("studio aligner download", "voice", words("Downloading", "Downloaded", "narration aligner"), undefined, true),
  row("studio aligner delete", "voice", words("Removing", "Removed", "narration aligner"), undefined, true),
  row("docs", "library", a => a.flags.has("--stdout") ? words("Reading", "Read", "CLI reference") : words("Refreshing", "Refreshed", "agent docs"), undefined, true),
  row("agent", "agent", words("Running", "Ran", "agent prompt", "{} agent prompts"), a => flag(a, "-p", "--provider") ?? first(a)),
  fallback,
];

const byKey = new Map(cliRegistry.map(entry => [entry.key, entry]));

// agent_guard reserves these commands for the student's terminal.
export const cliExclusions = {
  auth: ["auth", "auth canvas", "auth login", "auth logout", "auth status", "auth setup",
    "auth auto", "auth forget", "auth diagnose", "auth ed"],
  keyd: ["keyd", "keyd install", "keyd status", "keyd uninstall"],
};

function lookup(words: string[]) {
  let at = 0;
  while (words[at] === "--json") at++;
  let key = words[at]?.startsWith("-") ? "" : words[at++] ?? "";
  let entry = byKey.get(key);
  while (entry?.group || key === "auth" || key === "keyd") {
    while (words[at] === "--json") at++;
    if (!words[at] || words[at].startsWith("-")) break;
    key += " " + words[at++];
    entry = byKey.get(key);
  }
  return { entry: entry ?? fallback, key, args: parseArgs(words.slice(at), key) };
}

export interface CliAction {
  key: string;
  icon: CliIcon;
  state: CliState;
  em?: string;
  title: (n: number) => string;
  tally: (n: number) => string;
  writes: boolean;
  count: number;
}

type Call = ReturnType<typeof lookup>;

function unfinished(call: Call, state: "failed" | "refused" | "stopped", chain: boolean): CliAction {
  const { entry, key, args } = call;
  const memory = key === "memory write" && state === "refused" && !chain;
  const name = chain ? "Command chain" : memory ? "Memory write" : "Command";
  const label = `${name} ${state}`;
  return {
    key, icon: entry.icon, state, count: 1, writes: entry.writes,
    em: chain ? undefined : join(memory ? undefined : key, entry.fallback ? undefined : entry.emphasis(args)),
    title: () => label,
    tally: n => n === 1 ? label.toLowerCase() : `${n} ${name.toLowerCase()}s ${state}`,
  };
}

function describeCall({ entry, key, args }: Call, state: "done" | "live", output: string): CliAction {
  let wording = entry.wording(args);
  let em = entry.fallback ? key || undefined : entry.emphasis(args);
  let count = 1;
  let writes = entry.writes && !args.flags.has("--dry-run") && !args.flags.has("--print-prompt");
  if (args.flags.has("--help") || args.flags.has("-h") || key === "help") {
    wording = words("Reading", "Read", "command help");
    em = key === "help" ? args.pos.join(" ") : key || "oculus";
    writes = false;
  } else if (key === "memory write" && state === "done") {
    wording = memoryWording(output) ?? wording;
  } else if (key === "quiz add" && args.flags.has("--batch")) {
    const drafted = state === "done" ? draftedCount(output) : undefined;
    if (drafted) count = drafted;
    else wording = words("Drafting", "Drafted", "a batch of questions", "{} batches of questions");
  } else if (key === "docs" && args.flags.has("--stdout")) {
    writes = false;
  }
  const title = state === "live" ? wording.live : wording.done;
  return { key, state, icon: entry.icon, em, count, writes, title,
    tally: state === "live" ? n => title(n).toLowerCase() : wording.tally };
}

export function describeOculusCli(line: string, meta: ToolMeta = {}, running = true): CliAction[] {
  const { commands, combinedStatus } = parseShell(unwrapShell(line));
  const calls = commands.flatMap(words => {
    let at = 0;
    while (/^[a-zA-Z_]\w*=/.test(words[at]) || ["env", "time"].includes(words[at])) at++;
    return words[at] && isOculus(words[at]) ? [lookup(words.slice(at + 1))] : [];
  });
  const first = calls[0];
  if (!first) return [];
  const output = meta.output ?? "";
  const state = cliState(meta, running);
  if (state !== "done" && state !== "live") {
    const refused = state === "failed" && calls.length === 1 && refusedWrite(first.key, output);
    return [unfinished(first, refused ? "refused" : state, calls.length > 1)];
  }
  // Only && makes a successful shell exit evidence for every command in the chain.
  if (combinedStatus) {
    const wording = words("Running", "Ran", calls.length > 1 ? "command chain" : "shell command");
    return [{ key: "shell", state, icon: first.entry.icon, em: line, count: 1, writes: false,
      title: state === "live" ? wording.live : wording.done, tally: wording.tally }];
  }
  return calls.map(call => describeCall(call, state, calls.length === 1 ? output : ""));
}

export function summariseOculusCli(actions: CliAction[]) {
  const first = actions[0];
  if (!first) return null;
  const same = actions.every(a => a.key === first.key && a.title(1) === first.title(1));
  const shown = same ? actions : [first];
  const em = [...new Set(shown.map(a => a.em).filter(Boolean))].join(", ") || undefined;
  const count = shown.reduce((sum, a) => sum + a.count, 0);
  return { title: first.title(count), em: same ? em : join(em, `+${actions.length - 1} more`), icon: first.icon };
}
