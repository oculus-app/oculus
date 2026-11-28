import type { ReactNode } from "react";
import { CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { loadDataDir } from "@/hooks/backend/useDataDir";
import { ACTION_LABELS, pdfNotice, type PdfNoticeAction } from "@/lib/pdf/pdfNotice";

/** Covers the viewer, centred on its card. */
function Cover({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-8 bg-card">
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">{children}</div>
    </div>
  );
}

/**
 * Why a PDF (or an Office file's converted PDF) can't be shown: a warning
 * glyph, a title and one plain reason (`pdfNotice`), and the one action
 * that could help. `path` is the library file the student opened.
 */
export function PdfNotice({
  error,
  path,
  office = false,
  converting = false,
  onAction,
}: {
  error: string;
  path: string;
  office?: boolean;
  /** `error` came from making an Office file's PDF (`ensure_doc_pdf`). */
  converting?: boolean;
  /** Runs `convert` or `retry`; `reveal` is handled here. */
  onAction?: (action: PdfNoticeAction) => void;
}) {
  const copy = pdfNotice(error, path, office, converting);
  const act = (action: PdfNoticeAction) => {
    if (action !== "reveal") return onAction?.(action);
    void loadDataDir()
      .then((dir) => revealItemInDir(`${dir}/${path}`))
      .catch((e) => console.warn(`[oculus] reveal ${path}: ${e}`));
  };
  const action = copy.action === "reveal" || onAction ? copy.action : undefined;
  return (
    <Cover>
      <span className="flex size-10 items-center justify-center rounded-full bg-warning/10 text-warning">
        <WarningCircle size={22} weight="fill" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <p className="text-[13px] text-muted-foreground">{copy.reason}</p>
      </div>
      {(copy.link || action) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {copy.link && (
            <Button size="sm" onClick={() => void openUrl(copy.link!.url)}>
              {copy.link.label}
            </Button>
          )}
          {action && (
            <Button variant="outline" size="sm" onClick={() => act(action)}>
              {ACTION_LABELS[action]}
            </Button>
          )}
        </div>
      )}
    </Cover>
  );
}

/** An Office file's PDF being made before it can be shown. */
export function PdfConverting() {
  return (
    <Cover>
      <div className="flex items-center gap-2 text-muted-foreground">
        <CircleNotch size={16} className="animate-spin" />
        <span className="text-sm">Converting to PDF…</span>
      </div>
      <p className="text-[13px] text-muted-foreground">This takes a few seconds the first time.</p>
    </Cover>
  );
}
