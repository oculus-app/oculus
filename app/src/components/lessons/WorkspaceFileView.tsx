import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { CodeFileViewer } from "@/components/files/CodeFileViewer";
import { FileViewer } from "@/components/files/FileViewer";
import { useDataDir } from "@/hooks/backend/useDataDir";
import type { DbFile } from "@/lib/db";
import { workspaceView } from "@/lib/ed/lessons";
import { mediaSrc } from "@/lib/lectures/media";
import { openFileSmart } from "@/lib/files/openFile";
import { QuietNote } from "./QuietNote";

const NO_PREVIEW = (
  <QuietNote title="No preview for this file" detail="Open the challenge in Ed to see it." />
);

/**
 * One workspace file, read-only whatever its format (`workspaceView`): an
 * image as itself, a PDF in the PDF viewer, a video in a bare player (the
 * library's would write a transcript into the mirror), any other file as its
 * source in the code viewer, notebooks and markdown too, so nothing here opens
 * an editor. Editing happens on Ed.
 */
export function WorkspaceFileView({ file, files }: { file: DbFile; files: DbFile[] }) {
  const dataDir = useDataDir();
  switch (workspaceView(file.filename)) {
    case "image":
      return (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {dataDir && (
            <img
              src={convertFileSrc(`${dataDir}/${file.relative_path}`.replace(/\/{2,}/g, "/"))}
              alt={file.filename}
              className="max-w-full rounded-lg border border-border"
            />
          )}
        </div>
      );
    case "pdf":
      return <FileViewer file={file} files={files} onOpenFile={openFileSmart} />;
    case "video":
      return <WorkspaceVideo relPath={file.relative_path} />;
    case "none":
      return NO_PREVIEW;
    case "text":
      return <CodeFileViewer file={file} unreadable={NO_PREVIEW} />;
  }
}

/** Streams from Rust's media server, as every video does (`mediaSrc`). */
function WorkspaceVideo({ relPath }: { relPath: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    mediaSrc(relPath).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [relPath]);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
      {src && <video src={src} controls className="max-h-full max-w-full" />}
    </div>
  );
}
