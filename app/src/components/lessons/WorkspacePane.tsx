import { useEffect, useState } from "react";
import type { DbFile } from "@/lib/db";
import type { WorkspaceEntry } from "@/lib/ed/lessons";
import { recordFileAccess } from "@/lib/files/openFile";
import { QuietNote } from "./QuietNote";
import { WorkspaceFileView } from "./WorkspaceFileView";
import { WorkspaceTree } from "./WorkspaceTree";

/**
 * A challenge's synced files as Ed lays out its workspace: the tree in a
 * narrow column, the chosen file beside it (the first until one is picked),
 * each column its own one scroller. Showing a file stamps it accessed, as
 * opening one does.
 */
export function WorkspacePane({
  entries,
  files,
}: {
  entries: WorkspaceEntry[];
  /** The subject's files, which a PDF's links resolve against. */
  files: DbFile[];
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const fileEntries = entries.filter((e) => e.kind === "file");
  const shown = fileEntries.find((e) => e.path === picked) ?? fileEntries[0];

  const shownId = shown?.file.id;
  const subjectId = shown?.file.subject_id;
  useEffect(() => {
    if (shownId != null) recordFileAccess({ id: shownId, subject_id: subjectId });
  }, [shownId, subjectId]);

  if (!shown) {
    return <QuietNote title="No files synced yet" detail="The next sync fetches this challenge's files." />;
  }
  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-52 shrink-0 border-r border-border-subtle">
        <WorkspaceTree entries={entries} selected={shown.path} onSelect={setPicked} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceFileView key={shown.file.id} file={shown.file} files={files} />
      </div>
    </div>
  );
}
