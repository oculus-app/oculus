import { useEffect, useId, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { harnessThreadAttachments, type HarnessThread } from "@/lib/harness";

/**
 * "Delete chat?" for a thread row's ⋯ → Delete. When the chat holds files
 * the student attached that no other chat names (`harness_thread_attachments`),
 * a ticked box offers to delete them too; what the agent made always stays.
 */
export function DeleteThreadDialog({
  thread,
  onCancel,
  onConfirm,
}: {
  thread: HarnessThread | null;
  onCancel: () => void;
  /** `attachments`: the files to delete after the chat, or none. */
  onConfirm: (thread: HarnessThread, attachments: string[]) => void;
}) {
  const [files, setFiles] = useState<{ thread: number; paths: string[] } | null>(null);
  const [withFiles, setWithFiles] = useState(true);
  const boxId = useId();
  const id = thread?.id ?? null;

  useEffect(() => {
    if (id == null) return;
    setWithFiles(true);
    let live = true;
    harnessThreadAttachments(id)
      .then((paths) => live && setFiles({ thread: id, paths }))
      // Never swallow: without the list the box is left off, and that should be traceable.
      .catch((e) => console.error("thread attachments read failed", e));
    return () => {
      live = false;
    };
  }, [id]);

  const paths = files != null && files.thread === id ? files.paths : [];
  const count = paths.length;
  return (
    <ConfirmDialog
      open={thread != null}
      onCancel={onCancel}
      onConfirm={() => thread && onConfirm(thread, withFiles ? paths : [])}
      title="Delete chat?"
      description={
        <>
          This deletes <span className="font-medium text-foreground">{thread?.title?.trim() || "Untitled"}</span> and
          its messages. This can't be undone.
        </>
      }
      confirmLabel="Delete chat"
    >
      {count > 0 && (
        <label htmlFor={boxId} className="flex cursor-pointer items-center gap-2.5 text-[13px]">
          <Checkbox id={boxId} checked={withFiles} onCheckedChange={(c) => setWithFiles(c === true)} />
          Also delete {count === 1 ? "the file" : `the ${count} files`} attached to this chat
        </label>
      )}
    </ConfirmDialog>
  );
}
