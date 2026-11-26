import type { Capabilities } from "./capabilities";
import { providerLabel } from "./registry";
import type { PermissionMode } from "./types";

/** The composer's control for how a chat asks (docs/harness.md "Requests"). */

export const PERMISSION_MODES: PermissionMode[] = ["ask", "auto", "quiet"];

export const MODE_LABEL: Record<PermissionMode, string> = {
  ask: "Ask",
  auto: "Auto",
  quiet: "Don't ask",
};

const MODE_LINE: Record<PermissionMode, string> = {
  ask: "You approve what the sandbox blocks",
  auto: "The agent's reviewer decides",
  quiet: "Blocked actions are declined",
};

export interface ModeChoice {
  mode: PermissionMode;
  label: string;
  line: string;
}

/** Provider-specific names for native Auto. */
const AUTO_LINE: Partial<Record<Capabilities["provider"], string>> = {
  claude: "Classifier decides",
  antigravity: "Antigravity's own Auto decides",
};

export function modeChoices(caps: Pick<Capabilities, "provider" | "approvals" | "autoReview">): {
  note: string | null;
  choices: ModeChoice[];
} {
  const who = providerLabel(caps.provider);
  let note = null;
  if (caps.provider === "antigravity" && caps.autoReview) {
    note = "In Auto, Antigravity approves its own edits and commands. Course folders stay read-only. Oculus cannot keep it out of the database or other files on this Mac.";
  } else if (!caps.approvals) {
    note = `${who} cannot ask yet: anything its sandbox blocks is declined, whichever you choose.`;
  }
  const autoLine = caps.autoReview
    ? AUTO_LINE[caps.provider] ?? MODE_LINE.auto
    : `${who} has no reviewer${caps.approvals ? ", so it asks" : ""}`;
  const choices = PERMISSION_MODES.map((mode) => ({
    mode,
    label: MODE_LABEL[mode],
    line: mode === "auto" ? autoLine : MODE_LINE[mode],
  }));
  return { note, choices };
}

/** The mode a chat runs under; Rust's default for a chat is `ask`. */
export const threadMode = (mode: PermissionMode | null | undefined): PermissionMode => mode ?? "ask";
