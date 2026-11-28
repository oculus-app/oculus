import { useRef } from "react";
import { useSubjects } from "@/hooks/data/useSubjects";
import { useDriveDrop } from "@/hooks/drive/useDriveDrop";
import { useFolderListing } from "@/hooks/drive/useFolderListing";
import { useStoredSet } from "@/hooks/ui/useStoredState";
import { dropInto, importInto, reportDriveProblem } from "@/lib/drive/actions";
import { READ_ONLY_TEXT } from "@/lib/drive/commands";
import { isSubjectsFolder } from "@/lib/drive/home";
import { navigateActive } from "@/lib/shell/tabRouters";
import { SubjectsBranch } from "./SubjectsBranch";
import { TreeFolder, type TreeEnv } from "./TreeFolder";

/**
 * Drive's folder tree, for its nav column: Subjects (the folder of
 * subjects), then the student's own top-level folders, each opening in place
 * to its folders (read when first opened). Which rows are open is remembered
 * (`useStoredSet`). Rows are drop targets for Finder files and for entries
 * dragged from the browser, as its folder cards are.
 */
export function DriveTree({ current, folderHref }: {
  /** The folder on screen, highlighted. */
  current: string | null;
  folderHref: (rel: string) => string;
}) {
  const { subjects } = useSubjects();
  const [open, setOpen] = useStoredSet("oculus-drive-tree-open");
  const ref = useRef<HTMLDivElement>(null);
  const { hover, handlers } = useDriveDrop(ref, {
    fallback: null,
    onFiles: (paths, target) => void importInto(paths, target.rel, subjects),
    onEntries: (plan, target) => void dropInto(plan, target.rel, subjects),
    onRefused: () => reportDriveProblem(READ_ONLY_TEXT),
  });
  const env: TreeEnv = {
    current,
    folderHref,
    open,
    toggle: (rel) => setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    }),
    hover,
    navigate: (rel) => navigateActive(folderHref(rel)),
  };

  const top = useFolderListing("").listing;

  return (
    <div ref={ref} role="tree" aria-label="Folders" {...handlers}>
      {top?.folders.map((entry) =>
        isSubjectsFolder(entry.relativePath) ? (
          <SubjectsBranch key={entry.relativePath} entry={entry} env={env} subjects={subjects} />
        ) : (
          <TreeFolder key={entry.relativePath} entry={entry} depth={0} env={env} parentWritable />
        ),
      )}
    </div>
  );
}
