// Where the app keeps its data, derived as keyd_core::paths::data_dir does, and
// where the coding CLIs keep their session logs.
import { homedir } from "node:os";
import { join } from "node:path";

const IDENTIFIER = "com.tchan.oculus";

/** The app's data directory: `--data` wins, else the platform's place for it. */
export function dataDir(flag?: string): string {
  if (flag) return flag;
  const home = homedir();
  if (process.platform === "win32") return join(home, "Oculus");
  if (process.platform === "darwin") return join(home, "Library", "Application Support", IDENTIFIER);
  return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), IDENTIFIER);
}

/** A Studio video's folder, as `studio::videos` lays it out. */
export const videoDir = (data: string, slug: string) => join(data, "studio", "videos", slug);

/** Claude Code's per-project session folders. */
export const claudeProjects = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");

/** Claude Code names a project's folder after its cwd with every other character a `-`. */
export const claudeProjectFolder = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

/** Codex's rollouts, one `YYYY/MM/DD` folder per day. */
export const codexSessions = () => join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
