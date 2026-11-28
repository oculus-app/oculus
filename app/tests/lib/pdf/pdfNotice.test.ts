import { describe, expect, test } from "bun:test";
import { LIBREOFFICE_DOWNLOAD, pdfNotice } from "@/lib/pdf/pdfNotice";

const OWN = "Notes/essay.docx";
const SYNCED = "courses/X/Course/Files/w1.pdf";

describe("a PDF that can't be shown", () => {
  test("is said in words: no raw code is ever the title or the reason", () => {
    const codes = ["not-found", "encrypted", "invalid", "outside-library", "office-conversion", "no-libreoffice", "weird-code"];
    for (const code of codes) {
      for (const converting of [false, true]) {
        const { title, reason } = pdfNotice(code, SYNCED, converting, converting);
        expect(title).not.toContain(code);
        expect(reason).not.toContain(code);
        expect(title.length).toBeGreaterThan(0);
      }
    }
  });

  test("a missing synced file waits for the sync; a missing own file offers nothing", () => {
    expect(pdfNotice("not-found", SYNCED, false).reason).toContain("next sync");
    expect(pdfNotice("not-found", SYNCED, false).action).toBeUndefined();
    expect(pdfNotice("not-found", OWN, true, true).reason).toContain("outside Oculus");
    expect(pdfNotice("not-found", OWN, true, true).action).toBeUndefined();
  });

  test("a failed conversion offers it again, and names LibreOffice when it is missing", () => {
    expect(pdfNotice("office-conversion", OWN, true, true).action).toBe("convert");
    const missing = pdfNotice("no-libreoffice", OWN, true, true);
    expect(missing.title).toContain("LibreOffice");
    expect(missing.action).toBe("convert");
    expect(missing.link?.url).toBe(LIBREOFFICE_DOWNLOAD);
    expect(pdfNotice("office-conversion", OWN, true, true).link).toBeUndefined();
  });

  test("an unreadable PDF is shown in the file browser; an unknown failure keeps its sentence", () => {
    expect(pdfNotice("invalid", SYNCED, false).action).toBe("reveal");
    expect(pdfNotice("encrypted", SYNCED, false).action).toBe("reveal");
    const odd = pdfNotice("could not save the converted PDF: disk full", OWN, true, true);
    expect(odd.reason).toBe("could not save the converted PDF: disk full");
    expect(odd.action).toBe("convert");
    expect(pdfNotice("boom", SYNCED, false).action).toBe("retry");
  });
});
