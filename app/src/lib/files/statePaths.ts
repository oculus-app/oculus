/** The app's own folder at the top of the data dir, `.oculus/`: the agents'
 *  workspace, Studio, notebook page pictures and the database. Mirrors
 *  `app/src-tauri/src/library/paths/state.rs`.
 *
 *  Stored chats are never rewritten, so each folder is read in two
 *  spellings: under `.oculus/`, where it is, and at the top of the data dir,
 *  as older rows name it. This file is the one mapping between them. */

/** `STATE_DIR` in Rust. */
export const STATE_DIR = ".oculus";

const AGENTS = "agents";
const STUDIO = "studio";
const NOTEBOOK_PAGES = "whiteboard-pages";
/** The notebook pages folder as the oldest rows name it. */
const CANVAS_PAGES = "canvas-pages";

/** The database file; SQLite keeps its `-wal` and `-shm` beside it. */
export const DB_PATH = `${STATE_DIR}/oculus.db`;

/** Every chat agent's working directory, data-dir-relative. */
export const AGENTS_DIR = `${STATE_DIR}/${AGENTS}`;
export const ATTACHMENTS_DIR = `${AGENTS_DIR}/attachments`;
export const OUTPUTS_DIR = `${AGENTS_DIR}/outputs`;
export const MEMORIES_DIR = `${AGENTS_DIR}/memories`;
export const STUDIO_DIR = `${STATE_DIR}/${STUDIO}`;
/** One folder of page pictures per notebook (`PAGES_DIR` in Rust). */
export const NOTEBOOK_PAGES_DIR = `${STATE_DIR}/${NOTEBOOK_PAGES}`;

/** A top-level name older rows spell, to the folder it means. */
const TOP_LEVEL = new Map([
  [AGENTS, AGENTS_DIR],
  [STUDIO, STUDIO_DIR],
  [NOTEBOOK_PAGES, NOTEBOOK_PAGES_DIR],
  [CANVAS_PAGES, NOTEBOOK_PAGES_DIR],
]);

/** A data-dir-relative path as the disk has it: `agents/x` is
 *  `.oculus/agents/x`. A path under `.oculus/`, a course or anything else is
 *  returned as it is. */
export function stateRel(rel: string): string {
  const cut = rel.indexOf("/");
  const first = cut < 0 ? rel : rel.slice(0, cut);
  const dir = TOP_LEVEL.get(first);
  return dir ? dir + rel.slice(first.length) : rel;
}

/** Regex source for a state folder in either spelling, data-dir-relative. */
const either = (name: string) => `(?:${STATE_DIR.replace(".", "\\.")}\\/)?${name}`;

/** `agents` or `.oculus/agents`, as regex source. */
export const AGENTS_PATTERN = either(AGENTS);
/** `studio` or `.oculus/studio`, as regex source. */
export const STUDIO_PATTERN = either(STUDIO);

/** True for a canonical path inside the agents' workspace. */
export const inAgentsDir = (path: string): boolean => path.startsWith(`${AGENTS_DIR}/`);

/** True for a canonical path among the agents' memories. */
export const inMemoriesDir = (path: string): boolean => path.startsWith(`${MEMORIES_DIR}/`);

/** True for a canonical path inside the notebook pages folder. */
export const inNotebookPagesDir = (path: string): boolean => path.startsWith(`${NOTEBOOK_PAGES_DIR}/`);
