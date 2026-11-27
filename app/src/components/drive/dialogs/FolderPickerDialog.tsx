import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Folder } from "@phosphor-icons/react";
import { DriveTree } from "../tree/DriveTree";
import { TreeRow } from "../tree/TreeRow";

/**
 * Pick one of the student's folders, for Copy to my files… and Move to…: a
 * subject's folder tree (`subjectRel`), or for an entry with no subject all
 * of Drive under a My Drive row that picks the top level. Only folders they
 * may add to can be picked.
 */
export function FolderPickerDialog({ request, onCancel, onPick }: {
  request: { title: string; action: string; subjectRel: string | null; start: string | null } | null;
  onCancel: () => void;
  onPick: (targetDir: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(request?.start ?? null), [request]);
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>Choose one of your folders.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border-subtle p-1">
          {request && request.subjectRel == null && (
            <TreeRow
              depth={0}
              icon={<Folder size={14} className="text-muted-foreground" />}
              label="My Drive"
              active={picked === ""}
              onActivate={() => setPicked("")}
              hover={null}
            />
          )}
          {request && (
            <DriveTree
              root={request.subjectRel ?? undefined}
              current={picked}
              onPick={setPicked}
              storageKey="oculus-drive-picker-open"
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={picked == null} onClick={() => picked != null && onPick(picked)}>{request?.action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
