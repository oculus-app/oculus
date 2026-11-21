import { splitMaths } from "./maths";

/**
 * The drawable part of a fence that is still streaming: everything up to
 * its last complete tag, entity and formula. The HTML parser closes whatever
 * elements are still open, so the cut is all the repair there is; a tag
 * half-written (`<rect x="1`) or a formula half-written (`$\sum_{i`) waits
 * for the delta that finishes it.
 */
export function repairPrefix(source: string): string {
  // A closing fence half-arrived (`` `` ``) is still the fence's text until
  // its last backtick lands; drawn, it is a line that appears and vanishes.
  let out = source.replace(/(^|\n)[ \t]*[`~]{1,}[ \t]*$/, "");
  const comment = out.lastIndexOf("<!--");
  if (comment >= 0 && out.indexOf("-->", comment) < 0) out = out.slice(0, comment);
  const lt = out.lastIndexOf("<");
  if (lt >= 0 && out.indexOf(">", lt) < 0) out = out.slice(0, lt);
  const entity = /&#?[a-z0-9]*$/i.exec(out);
  if (entity) out = out.slice(0, entity.index);
  const tail = out.lastIndexOf(">") + 1;
  const { open } = splitMaths(out.slice(tail));
  if (open >= 0) out = out.slice(0, tail + open);
  return out;
}
