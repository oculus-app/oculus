import { Archive, BookOpen } from "@phosphor-icons/react";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { useFolderListing } from "@/hooks/drive/useFolderListing";
import type { Subject } from "@/lib/db";
import type { FolderEntry } from "@/lib/drive/listing";
import { subjectForFolder } from "@/lib/drive/paths";
import { SUBJECTS_LABEL } from "@/lib/files/labels";
import { displayCode, displayName } from "@/lib/format/format";
import { TreeFolder, type TreeEnv } from "./TreeFolder";
import { TreeRow } from "./TreeRow";

const PAST = ":past";

/** A subject's folder, by its code and icon; a folder of no known subject
 *  by its own name. */
export function SubjectRow({ entry, depth, env, subjects }: {
  entry: FolderEntry;
  depth: number;
  env: TreeEnv;
  subjects: readonly Subject[];
}) {
  const subject = subjectForFolder(entry.name, subjects);
  return (
    <TreeFolder
      entry={entry}
      depth={depth}
      env={env}
      parentWritable={false}
      icon={subject ? <SubjectIcon code={subject.code} size={14} /> : undefined}
      label={subject ? displayCode(subject.code) : entry.name}
      title={subject ? displayName(subject.name, subject.code) : entry.name}
    />
  );
}

/**
 * The folder of subjects as one row, with the rail's book: open, the current
 * subjects, then the rest folded under Past subjects. It is a place to go
 * through, so it takes no drop.
 */
export function SubjectsBranch({ entry, env, subjects }: {
  entry: FolderEntry;
  env: TreeEnv;
  subjects: readonly Subject[];
}) {
  const rel = entry.relativePath;
  const expanded = env.open.has(rel);
  return (
    <>
      <TreeRow
        depth={0}
        icon={<BookOpen size={14} className="text-muted-foreground" />}
        label={SUBJECTS_LABEL}
        count={entry.childCount}
        expanded={entry.childCount > 0 ? expanded : undefined}
        onToggle={() => env.toggle(rel)}
        active={env.current === rel}
        href={env.folderHref(rel)}
        onActivate={() => env.navigate(rel)}
        drop={{ rel, writable: false }}
        hover={env.hover}
      />
      {expanded && <SubjectFolders rel={rel} env={env} subjects={subjects} />}
    </>
  );
}

function SubjectFolders({ rel, env, subjects }: { rel: string; env: TreeEnv; subjects: readonly Subject[] }) {
  const { listing } = useFolderListing(rel);
  if (!listing) return null;
  const isCurrent = (entry: FolderEntry) => !!subjectForFolder(entry.name, subjects)?.is_current;
  const past = listing.folders.filter((f) => !isCurrent(f));
  const pastOpen = env.open.has(PAST);
  return (
    <>
      {listing.folders.filter(isCurrent).map((entry) => (
        <SubjectRow key={entry.relativePath} entry={entry} depth={1} env={env} subjects={subjects} />
      ))}
      {past.length > 0 && (
        <TreeRow
          depth={1}
          icon={<Archive size={14} />}
          label="Past subjects"
          expanded={pastOpen}
          onToggle={() => env.toggle(PAST)}
          onActivate={() => env.toggle(PAST)}
          active={false}
          hover={null}
        />
      )}
      {pastOpen && past.map((entry) => (
        <SubjectRow key={entry.relativePath} entry={entry} depth={2} env={env} subjects={subjects} />
      ))}
    </>
  );
}
