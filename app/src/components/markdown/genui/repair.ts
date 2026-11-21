/**
 * The drawable part of a fence that is still streaming: scans once through
 * text, tags, quoted attributes, comments, entities and `$…$`/`$$…$$` runs
 * (only where maths is eligible: outside `<svg>`, `<code>`, `<kbd>`) and cuts
 * before any unclosed construct. The HTML parser closes open ancestor tags.
 */
export function repairPrefix(source: string): string {
  // A closing fence half-arrived (`` `` ``) is still the fence's text until
  // its last delimiter lands; drawn, it is a line that appears and vanishes.
  const s = source.replace(/(^|\n)[ \t]*[`~]{1,}[ \t]*$/, "");
  let svgDepth = 0;
  let codeDepth = 0;
  let kbdDepth = 0;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c === "<") {
      if (s.startsWith("<!--", i)) {
        const end = s.indexOf("-->", i + 4);
        if (end < 0) return s.slice(0, i);
        i = end + 3;
        continue;
      }
      if (i + 1 === s.length || s.slice(i) === "<!" || s.slice(i) === "<!-") {
        return s.slice(0, i);
      }
      if (/[a-zA-Z/!?]/.test(s[i + 1])) {
        const tagStart = i;
        i += 2;
        let quote: '"' | "'" | null = null;
        let closed = false;
        while (i < s.length) {
          const ch = s[i];
          if (quote) {
            if (ch === quote) quote = null;
            i++;
          } else if (ch === '"' || ch === "'") {
            quote = ch;
            i++;
          } else if (ch === ">") {
            const inner = s.slice(tagStart + 1, i).trim();
            if (inner.startsWith("/")) {
              const name = /^\/([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner)?.[1]?.toLowerCase();
              if (name === "svg") svgDepth = Math.max(0, svgDepth - 1);
              else if (name === "code") codeDepth = Math.max(0, codeDepth - 1);
              else if (name === "kbd") kbdDepth = Math.max(0, kbdDepth - 1);
            } else if (!inner.startsWith("!") && !inner.startsWith("?")) {
              const name = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner)?.[1]?.toLowerCase();
              if (!/\/\s*$/.test(inner)) {
                if (name === "svg") svgDepth++;
                else if (name === "code") codeDepth++;
                else if (name === "kbd") kbdDepth++;
              }
            }
            i++;
            closed = true;
            break;
          } else {
            i++;
          }
        }
        if (!closed) return s.slice(0, tagStart);
        continue;
      }
      i++;
      continue;
    }

    if (c === "&") {
      const entityStart = i;
      let j = i + 1;
      if (s[j] === "#") {
        j++;
        if (s[j] === "x" || s[j] === "X") {
          j++;
          while (j < s.length && /[0-9a-fA-F]/.test(s[j])) j++;
        } else {
          while (j < s.length && /[0-9]/.test(s[j])) j++;
        }
      } else {
        while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j++;
      }
      if (j === s.length) return s.slice(0, entityStart);
      i = s[j] === ";" ? j + 1 : i + 1;
      continue;
    }

    if (svgDepth === 0 && codeDepth === 0 && kbdDepth === 0) {
      if (c === "\\" && s[i + 1] === "$") {
        i += 2;
        continue;
      }
      if (c === "$") {
        const mathStart = i;
        let size = 0;
        while (s[i + size] === "$") size++;
        i += size;
        let closed = false;
        while (i < s.length) {
          if (s[i] === "$") {
            const runStart = i;
            while (s[i] === "$") i++;
            if (i - runStart === size) {
              closed = true;
              break;
            }
          } else {
            i++;
          }
        }
        if (!closed) return s.slice(0, mathStart);
        continue;
      }
    }

    i++;
  }

  return s;
}
