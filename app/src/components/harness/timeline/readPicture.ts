import { isImagePath } from "@/lib/harness/attachments";

/** The asset for a Read row. Notebook manifests name pages under the data dir,
 *  and a persisted Read can name the same page under canvas-pages/. */
export function readPicturePath(raw: unknown, dataDir: string): string | null {
  if (!dataDir || typeof raw !== "string" || !isImagePath(raw)) return null;
  const path = raw.replace(/\\/g, "/");
  const prefix = dataDir + "/";
  const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path.replace(/^\.\.\//, "");
  if (relative.split("/").includes("..")) return null;
  if (/^(?:canvas|whiteboard)-pages\//.test(relative))
    return prefix + relative.replace(/^canvas-pages\//, "whiteboard-pages/");
  // Tauri checks absolute image reads against the asset scope.
  return /^(?:\/|[A-Za-z]:\/)/.test(path) ? path : null;
}
