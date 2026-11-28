import { isOwnPath } from "@/lib/files/libraryLayout";
import { isMac } from "@/lib/platform";

/** What a notice offers: run the conversion again, open the PDF again, or
 *  show the file in the system's file browser. */
export type PdfNoticeAction = "convert" | "retry" | "reveal";

export interface PdfNoticeCopy {
  title: string;
  reason: string;
  action?: PdfNoticeAction;
  /** A page to open in the browser, offered before `action`. */
  link?: { label: string; url: string };
}

/** LibreOffice's own download page, which picks the build for the OS. */
export const LIBREOFFICE_DOWNLOAD = "https://www.libreoffice.org/download/download-libreoffice/";

export const REVEAL_LABEL = isMac ? "Show in Finder" : "Show in File Explorer";

export const ACTION_LABELS: Record<PdfNoticeAction, string> = {
  convert: "Convert again",
  retry: "Try again",
  reveal: REVEAL_LABEL,
};

/** A file that isn't on disk: a synced one comes back with the next sync
 *  (no single-file download exists); the student's own may have moved. */
function missing(path: string): PdfNoticeCopy {
  return isOwnPath(path)
    ? { title: "This file isn't on disk", reason: "It may have been moved or deleted outside Oculus." }
    : { title: "This file isn't on disk", reason: "The next sync of this subject downloads it again." };
}

/**
 * The words for why a PDF can't be shown, from the code Rust refused with:
 * `pdf_open`'s (`not-found`, `encrypted`, `invalid`, `outside-library`) or,
 * for an Office file, `ensure_doc_pdf`'s (`office-conversion`,
 * `no-libreoffice`, `not-found`). `path` is the library file the student
 * opened, `office` whether it is shown through a converted PDF, and
 * `converting` whether `error` came from making that PDF rather than opening
 * it. Anything else is a sentence, shown as the reason, never the title.
 */
export function pdfNotice(error: string, path: string, office: boolean, converting = false): PdfNoticeCopy {
  switch (error) {
    case "not-found":
      return missing(path);
    case "office-conversion":
      return {
        title: "This file couldn't be converted to PDF",
        reason: "LibreOffice couldn't read it, so there are no pages to show.",
        action: "convert",
      };
    case "no-libreoffice":
      return {
        title: "LibreOffice is needed to show this file",
        reason: "Oculus shows Word and PowerPoint files as PDFs made with LibreOffice. Install it, then convert again.",
        action: "convert",
        link: { label: "Download LibreOffice", url: LIBREOFFICE_DOWNLOAD },
      };
    case "encrypted":
      return {
        title: "This PDF is password-protected",
        reason: "Oculus can't open a PDF that needs a password.",
        action: "reveal",
      };
    case "invalid":
      return {
        title: office ? "This file's PDF can't be read" : "This PDF can't be read",
        reason: "It may be damaged, or not really a PDF.",
        action: "reveal",
      };
    case "outside-library":
      return { title: "This file is outside the library", reason: "Oculus only opens files inside its library folder." };
    default:
      return {
        title: converting ? "This file couldn't be converted to PDF" : "This PDF couldn't be opened",
        reason: /\s/.test(error) ? error : "Something went wrong.",
        action: converting ? "convert" : "retry",
      };
  }
}
