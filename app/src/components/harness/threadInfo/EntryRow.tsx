import { BookmarkSimple, FilmSlate } from "@phosphor-icons/react";
import { fileIconFor } from "@/lib/files/fileTypes";
import { fileTitle, folderTitle, pathFile } from "@/lib/files/openFile";
import { fileReferenceAppearance } from "@/lib/files/referenceAppearance";
import { displayCode, humanizeSlug } from "@/lib/format/format";
import { formatPages, formatTimes, type InfoEntry } from "@/lib/harness/threadInfo";
import { parsedSourceOf } from "@/lib/citations/parse";
import { InfoRow } from "./InfoRow";
import { openTarget } from "./openTarget";
import { recordingOf } from "@/lib/files/libraryLayout";
import { MEMORIES_DIR, inAgentsDir, inMemoriesDir } from "@/lib/files/statePaths";
import { useChatSaveScope } from "@/components/harness/save/ChatSaveScope";
import { SaveToDriveAction } from "@/components/harness/save/SaveToDriveAction";
import { useChatSave } from "@/stores/chat/chatSaveStore";

const ICON = 15;
const base = (p: string) => p.replace(/\/+$/, "").split("/").pop() ?? p;

/** A memory's row names it as its index does, by the name read as words; a
 *  bucket is named by its subject. */
function memoryLabel(path: string): string {
  const parts = path.slice(MEMORIES_DIR.length + 1).split("/");
  if (parts.length > 2) return base(path);
  const name = parts[parts.length - 1];
  const subject = parts.length === 2 ? parts[0] : "";
  if (name) return humanizeSlug(name.replace(/\.md$/, ""));
  return subject ? `Memories · ${displayCode(subject)}` : "Memories";
}

/** Glyph and name: a library file as its chip draws it, a lecture by its
 *  title, the agent's own files by their file names. */
function look(entry: InfoEntry, lectureTitle: (id: string) => string | undefined) {
  const { path } = entry;
  if (inMemoriesDir(path)) {
    return { icon: <BookmarkSimple size={ICON} className="text-muted-foreground" />, label: memoryLabel(path) };
  }
  if (entry.target.kind === "route") {
    const Icon = entry.label ? FilmSlate : fileIconFor(base(path));
    return { icon: <Icon size={ICON} className="text-muted-foreground" />, label: entry.label ?? base(path) };
  }
  if (inAgentsDir(path)) {
    const Icon = fileIconFor(base(path));
    return { icon: <Icon size={ICON} className="text-muted-foreground" />, label: base(path) };
  }
  const file = pathFile(parsedSourceOf(path) ?? path);
  const { Icon, tone } = fileReferenceAppearance(file, path);
  const lecture = recordingOf(path) === path ? path : null;
  const label = lecture
    ? (lectureTitle(lecture) ?? "Lecture")
    : path.endsWith("/")
      ? folderTitle(path)
      : fileTitle(file);
  return { icon: <Icon size={ICON} className={tone} />, label };
}

export function EntryRow({
  entry,
  lectureTitle,
  onOpened,
}: {
  entry: InfoEntry;
  lectureTitle: (id: string) => string | undefined;
  /** After the row opens its thing: the popover closes. */
  onOpened?: () => void;
}) {
  const { icon, label } = look(entry, lectureTitle);
  // A file the thread made in its workspace can be kept; the agent's own
  // (memories, taste) are refused by Rust and show nothing.
  const scope = useChatSaveScope();
  const workspace = !!scope && !!entry.made && entry.target.kind === "library" && inAgentsDir(entry.path);
  const save = useChatSave(workspace ? entry.path : null);
  // A memory or a Studio step is named by what it is; a file says whether
  // the thread made it or changed it.
  const trailing = entry.made
    ? entry.label || inMemoriesDir(entry.path)
      ? undefined
      : entry.made === "new"
        ? "New"
        : "Edited"
    : formatTimes(entry.times) || formatPages(entry.pages);
  return (
    <InfoRow
      icon={icon}
      label={label}
      trailing={save?.saved ? undefined : trailing}
      action={
        save ? (
          <SaveToDriveAction
            path={entry.path}
            look="icon"
            reveal="group-hover/info:opacity-100 group-focus-within/info:opacity-100"
            className="rounded-md"
          />
        ) : undefined
      }
      title={entry.target.kind === "library" ? entry.target.path : entry.path}
      onOpen={(newTab) => {
        openTarget(entry.target, newTab);
        onOpened?.();
      }}
    />
  );
}
