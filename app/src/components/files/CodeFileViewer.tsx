import { useEffect, useState, type ReactNode } from "react";

import { LazyCodeEditor } from "@/components/code/LazyCodeEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingFill } from "@/components/ui/layout/PageParts";
import type { DbFile } from "@/lib/db";
import { readCourseFile } from "@/lib/files/courseFiles";

/** A source file in the library (`isCodeFile`), read-only in `CodeEditor`,
 *  an Ed challenge's files included: those are edited on Ed. */
export function CodeFileViewer({
  file,
  unreadable,
}: {
  file: DbFile;
  /** Shown instead of the error when the file can't be read as text, as a
   *  binary file can't. */
  unreadable?: ReactNode;
}) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setText(null);
    setErr(null);
    let live = true;
    readCourseFile(file.relative_path)
      .then((t) => live && setText(t))
      .catch((e) => live && setErr(String(e)));
    return () => {
      live = false;
    };
  }, [file.relative_path]);

  if (err && unreadable) return unreadable;
  if (err)
    return (
      <div className="px-6 py-5">
        <Alert variant="destructive">
          <AlertDescription className="text-xs">Failed to load file: {err}</AlertDescription>
        </Alert>
      </div>
    );
  if (text === null) return <LoadingFill />;
  return (
    <div className="min-h-0 flex-1">
      <LazyCodeEditor text={text} filename={file.filename} readOnly />
    </div>
  );
}
