import { useMemo, useRef } from "react";
import { useSubjects } from "@/hooks/data/useSubjects";
import { useDriveDrop } from "@/hooks/drive/useDriveDrop";
import { useFolderListing } from "@/hooks/drive/useFolderListing";
import { useStoredSet } from "@/hooks/ui/useStoredState";
import { dropInto, importInto, reportDriveProblem } from "@/lib/drive/actions";
import { READ_ONLY_TEXT } from "@/lib/drive/commands";
import { isSubjectsFolder } from "@/lib/drive/home";
import { COURSES_DIR } from "@/lib/files/libraryLayout";
import { navigateActive } from "@/lib/shell/tabRouters";
import { SubjectsBranch, SubjectRow } from "./SubjectsBranch";
import { TreeFolder, type TreeEnv } from "./TreeFolder";

/**
 * Drive's folder tree, for its nav column: Subjects (the folder of
 * subjects), then the student's own top-level folders, each opening in place
 * to its folders (read when first opened). Which rows are open is remembered
 * (`useStoredSet`). Rows are drop targets for Finder files and for entries
 * dragged from the browser, as its folder cards are.
 *
 * With `onPick` it is a folder picker: rows pick instead of navigating, and
 * folders the student can't add to are off. `root` narrows it to one
 * subject's folders.
 */
export function DriveTree({
  current,
  folderHref,
  onPick,
  root,
  storageKey = "oculus-drive-tree-open",
}: {
  /** The folder on screen (or picked), highlighted. */
  current: string | null;
  folderHref?: (rel: string) => string;
  onPick?: (rel: string) => void;
  /** A subject folder (`courses/<code>`) to show alone; all of Drive when unset. */
  root?: string;
  storageKey?: string;
}) {
  const { subjects } = useSubjects();
  const [open, setOpen] = useStoredSet(storageKey);
  const ref = useRef<HTMLDivElement>(null);
  const { hover, handlers } = useDriveDrop(ref, {
    fallback: null,
    onFiles: (paths, target) => void importInto(paths, target.rel, subjects),
    onEntries: (plan, target) => void dropInto(plan, target.rel, subjects),
    onRefused: () => reportDriveProblem(READ_ONLY_TEXT),
  });
  // A picker opens on its subject's folders.
  const shown = useMemo(() => (root ? new Set([...open, root]) : open), [open, root]);
  const env: TreeEnv = {
    current,
    folderHref,
    onPick,
    open: shown,
    toggle: (rel) => setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    }),
    hover,
    navigate: (rel) => folderHref && navigateActive(folderHref(rel)),
  };

  const top = useFolderListing(root == null ? "" : null).listing;
  const one = useFolderListing(root == null ? null : COURSES_DIR).listing;
  const subjectFolder = one?.folders.find((f) => f.relativePath === root);

  return (
    <div ref={ref} role="tree" aria-label="Folders" {...handlers}>
      {subjectFolder && <SubjectRow entry={subjectFolder} depth={0} env={env} subjects={subjects} />}
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
