import { CircleNotch } from "@phosphor-icons/react";
import { isOfficeFile } from "@/lib/files/fileTypes";
import { PdfNotice } from "./PdfNotice";

/** What covers the pages until there are some: why the document can't be
 *  shown (`PdfNotice`), or the spinner while it opens. `path` is the PDF;
 *  an Office file's converted copy is named for its original. */
export function PdfLoadState({
  path,
  error,
  loading,
  onRetry,
}: {
  path: string;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  if (error) {
    const original = path.replace(/\.pdf$/i, "");
    const office = isOfficeFile(original);
    return <PdfNotice error={error} path={office ? original : path} office={office} onAction={onRetry} />;
  }
  if (!loading) return null;
  return (
    <div className="absolute inset-0 flex items-start justify-center pt-8 pointer-events-none">
      <div className="flex items-center gap-2 text-muted-foreground">
        <CircleNotch size={16} className="animate-spin" />
        <span className="text-sm">Loading PDF…</span>
      </div>
    </div>
  );
}
