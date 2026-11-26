import type { RiskTone } from "./requestRisk";

/** A request must be on screen this long before a key answers it, so a
 *  keypress aimed at something else never answers one that just appeared. */
export const TRAY_KEY_DELAY_MS = 400;

export interface TrayKeyInput {
  key: string;
  repeat: boolean;
  /** Any of ⌘, Ctrl, ⌥ or Shift held. */
  modified: boolean;
  composing: boolean;
  /** Something already took the key (the `@` and `/` menu's Escape). */
  prevented: boolean;
  /** The approval tray is showing and no answer is out. */
  ready: boolean;
  /** Where focus is: this composer's editor, nothing or the tray itself
   *  (`free`, in the focused pane of the tab in front), or anywhere else. */
  focus: "editor" | "free" | "other";
  /** The editor holds no words, pastes or pictures. */
  draftEmpty: boolean;
  /** The editor's `@` or `/` menu is showing. */
  menuOpen: boolean;
  tone: RiskTone;
  /** How long the request has been on screen. */
  ageMs: number;
}

/**
 * What a key does to the waiting approval: Enter takes the default (Allow,
 * or Deny on a `danger` request) and Escape denies. Only on a plain,
 * fresh keypress, with focus in an empty editor whose menu is shut, or on
 * nothing in particular; text in the box keeps Enter as a send.
 */
export function trayKeyAction(i: TrayKeyInput): "allow" | "deny" | null {
  if (i.key !== "Enter" && i.key !== "Escape") return null;
  if (!i.ready || i.repeat || i.modified || i.composing || i.prevented) return null;
  if (i.ageMs < TRAY_KEY_DELAY_MS) return null;
  if (i.focus === "other") return null;
  if (i.focus === "editor" && (!i.draftEmpty || i.menuOpen)) return null;
  if (i.key === "Escape") return "deny";
  return i.tone === "danger" ? "deny" : "allow";
}
