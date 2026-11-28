import { Book, Folder } from "@phosphor-icons/react";
import { CatalogueIcon } from "@/components/ui/icon/CatalogueIcon";
import { courseColor, iconKey, useSubjectIconStore } from "@/stores/planning/subjectIconStore";
import { TOP_LEVEL } from "@/lib/files/libraryLayout";

/** A subject's stored identity, with a Book and course colour as defaults.
 *  A top-level file's row joins the reserved code, which is no subject: it
 *  draws Drive's folder, so no list of files paints it as one. */
export function SubjectIcon({ code, size = 14, className }: { code: string; size?: number; className?: string }) {
  const pref = useSubjectIconStore(s => s.prefs[iconKey(code)]);
  if (code === TOP_LEVEL.code) return <Folder size={size} className={className} aria-hidden />;
  return <CatalogueIcon name={pref?.icon} fallback={Book} color={pref?.color ?? courseColor(code)} size={size} className={className} />;
}
