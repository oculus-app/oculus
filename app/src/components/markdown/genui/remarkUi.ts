import type { Root } from "mdast";
import type { VFile } from "vfile";
import { visit } from "unist-util-visit";

/** Marks each ```ui fence with whether its closing fence has arrived, read
 *  from the source as `remarkWidgets` does for widget fences. */
export function remarkUi() {
  return (tree: Root, file: VFile) => {
    visit(tree, "code", (node) => {
      if (node.lang !== "ui") return;
      const raw = String(file.value).slice(node.position?.start.offset, node.position?.end.offset);
      const lines = raw.split("\n");
      const opening = /^\s*(`{3,}|~{3,})/.exec(lines[0] ?? "")?.[1];
      const closing = /^(?:[ \t]*>[ \t]*)*\s*(`{3,}|~{3,})\s*$/.exec(lines[lines.length - 1] ?? "")?.[1];
      const closed =
        lines.length > 1 && !!opening && !!closing && opening[0] === closing[0] && closing.length >= opening.length;
      node.data ??= {};
      node.data.hProperties = { ...node.data.hProperties, "data-fence-closed": closed };
    });
  };
}
