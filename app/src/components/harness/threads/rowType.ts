/**
 * The thread column's three text levels, after T3's sidebar: a small muted
 * meta line, a title a clear step brighter than the preview even when read,
 * and a smaller, dimmer preview. Shared by thread rows, search results and
 * the recent list, so they read alike.
 */
export const ROW_META = "text-[11.5px] text-muted-foreground";
export const ROW_TITLE = "text-[13.5px]";
/** Done, Approval, Question or Failed since last on screen. */
export const TITLE_ATTENTION = "font-medium text-foreground";
/** Read: foreground dimmed, still brighter than the preview in every theme. */
export const TITLE_READ = "text-foreground/80";
export const TITLE_READ_ACTIVE = "text-foreground/90";
export const ROW_PREVIEW = "text-[12.5px] text-muted-foreground/85";
/** A Subject group's heading over rows: more room above than below. */
export const SECTION_HEAD = "pt-4 pb-1";
/* Both below apply while the hover action (⋯) shows: the row is hovered, the
 * action holds focus, or its menu is open. Not the row's own focus, which
 * stays on the open chat's row after a click. Written out in full so
 * Tailwind finds every class. */

/** The line the action sits on: its end fades out under it, as a tab's
 *  title does under its ×, so the action needs no surface of its own. */
export const UNDER_ACTIONS =
  "under-actions group-hover/thread:[--under-actions-shift:0px] group-has-[[data-row-actions]:focus-within]/thread:[--under-actions-shift:0px] group-has-[[data-state=open]]/thread:[--under-actions-shift:0px]";
/** The status or age under the action, handed off to it: whichever leaves
 *  fades at once and the other follows 80 ms later, so the two are never seen
 *  together (an instant hide beside the ⋯'s fade drew "3 ···"). Opacity, not
 *  `invisible`: WebKit could paint a visibility flip a frame apart from the fade. */
export const HIDDEN_UNDER_ACTIONS =
  "transition-opacity will-change-[opacity] duration-100 ease-out delay-[80ms] group-hover/thread:opacity-0 group-hover/thread:delay-0 group-has-[[data-row-actions]:focus-within]/thread:opacity-0 group-has-[[data-row-actions]:focus-within]/thread:delay-0 group-has-[[data-state=open]]/thread:opacity-0 group-has-[[data-state=open]]/thread:delay-0";
/** The ⋯ itself: arrives 80 ms after the age leaves, and leaves at once. */
export const ROW_ACTIONS =
  "opacity-0 transition-opacity will-change-[opacity] duration-100 ease-out group-hover/thread:opacity-100 group-hover/thread:delay-[80ms] focus-within:opacity-100 has-[[data-state=open]]:opacity-100";
