import { useEffect, useState, type ReactNode } from "react";
import { ensureDocPdf } from "@/lib/pdf/docPdf";
import { PdfConverting, PdfNotice } from "./PdfNotice";

type Gate = { state: "checking" | "converting" | "ready" } | { state: "failed"; error: string };

/**
 * An Office file is shown as its converted PDF; one that arrived without it
 * (Finder, a chat agent, the library move) is converted first
 * (`ensure_doc_pdf`), or joins the parse already converting it. A PDF on
 * disk shows at once; a failure says why, with Convert again.
 */
export function DocPdfGate({ path, children }: { path: string; children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ state: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setGate({ state: "checking" });
    ensureDocPdf(path, () => live && setGate({ state: "converting" })).then(
      () => live && setGate({ state: "ready" }),
      (e) => live && setGate({ state: "failed", error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, [path, attempt]);

  if (gate.state === "ready") return <>{children}</>;
  return (
    <div className="relative flex-1 h-full">
      {gate.state === "converting" && <PdfConverting />}
      {gate.state === "failed" && (
        <PdfNotice error={gate.error} path={path} office converting onAction={() => setAttempt((n) => n + 1)} />
      )}
    </div>
  );
}
