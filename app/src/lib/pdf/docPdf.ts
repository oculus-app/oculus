import { Channel, invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

/** Rust's `sync::doc_pdf::READY_EVENT`: an Office file's missing PDF landed. */
export const DOC_PDF_READY_EVENT = "doc-pdf-ready";

/**
 * Makes `relativePath`'s converted PDF (an Office file's `x.docx.pdf`) if it
 * is missing, joining a parse already converting it; resolves once it is on
 * disk. `onConverting` runs when there is a conversion to wait for. Rejects
 * with `not-found`, `no-libreoffice`, `office-conversion` or a sentence.
 */
export function ensureDocPdf(relativePath: string, onConverting: () => void): Promise<void> {
  const converting = new Channel<string>();
  converting.onmessage = onConverting;
  return invoke<void>("ensure_doc_pdf", { relativePath, converting });
}

interface DocPdfState {
  /** Per Office file, how many times its PDF has landed this session. */
  landed: Record<string, number>;
  land: (relativePath: string) => void;
}

/** Bumped by `doc-pdf-ready` (`useDriveEvents`), so a Drive card that drew
 *  its glyph for want of a PDF tries its picture again. */
export const useDocPdfStore = create<DocPdfState>((set) => ({
  landed: {},
  land: (relativePath) =>
    set((s) => ({ landed: { ...s.landed, [relativePath]: (s.landed[relativePath] ?? 0) + 1 } })),
}));
