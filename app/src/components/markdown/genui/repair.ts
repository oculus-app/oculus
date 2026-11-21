import { scanMarkup } from "./scan";

/**
 * The drawable part of a fence that is still streaming: strips a half-arrived
 * closing fence and cuts before any unclosed trailing tag, comment, entity or
 * formula in the last maths-eligible text run. The HTML parser closes open
 * ancestor tags.
 */
export function repairPrefix(source: string): string {
  // A closing fence half-arrived (`` `` ``) is still the fence's text until
  // its last delimiter lands; drawn, it is a line that appears and vanishes.
  const s = source.replace(/(^|\n)[ \t]*[`~]{1,}[ \t]*$/, "");
  const { cutAt } = scanMarkup(s);
  return cutAt < 0 ? s : s.slice(0, cutAt);
}
