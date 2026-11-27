import { useEffect, useState } from "react";
import { useSubjects } from "@/hooks/data/useSubjects";
import { defaultDestination, settleDestination } from "@/lib/browser/downloads/destination";
import { guessSubject } from "@/lib/browser/downloads/subjectGuess";
import { listFolder } from "@/lib/drive/listing";
import { lastDestination } from "@/lib/drive/picker";
import { useBrowserStore } from "@/stores/shell/browserStore";
import { useInstitution } from "@/stores/sync/institutionStore";

/**
 * The folder the Save dialog offers for a download from browser tab `tab`
 * (`defaultDestination`), settled to one it can land in; null until the
 * subjects and the last folder are read and the folder checked.
 */
export function useDefaultDestination(tab: number): string | null {
  const { subjects, loading } = useSubjects();
  const institution = useInstitution();
  // A download-only tab closes as the dialog opens: the address it was
  // opened at is kept, since it still names the subject.
  const liveUrl = useBrowserStore((s) => s.tabs.find((t) => t.id === tab)?.url);
  const [tabUrl, setTabUrl] = useState(liveUrl);
  if (liveUrl && liveUrl !== tabUrl) setTabUrl(liveUrl);

  const [last, setLast] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    lastDestination()
      .catch(() => null)
      .then((rel) => live && setLast(rel));
    return () => { live = false; };
  }, []);

  const guess = guessSubject(tabUrl, subjects, institution?.canvas ?? null);
  const wanted = last === undefined || loading ? null : defaultDestination(guess, last);
  const [settled, setSettled] = useState<{ wanted: string; rel: string } | null>(null);
  useEffect(() => {
    if (wanted == null) return;
    let live = true;
    void settleDestination(wanted, (rel) => listFolder(rel)).then((rel) => live && setSettled({ wanted, rel }));
    return () => { live = false; };
  }, [wanted]);
  return settled?.wanted === wanted ? settled.rel : null;
}
