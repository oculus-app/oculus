import { describe, expect, test } from "bun:test";
import { folderOf, sizeWords, stateWords } from "@/lib/browser/downloads/describe";
import { isProblem, isSettled, isWaiting } from "@/lib/browser/downloads/types";
import { download } from "./fixtures";

const upload = {
  source: "a.pdf",
  file: { filename: "a.pdf", relative_path: "courses/X/Labs/a.pdf", file_type: "pdf", size_bytes: 10 },
  error: null,
};

describe("stateWords", () => {
  test("receiving with no choice, and with one", () => {
    expect(stateWords(download(1))).toEqual({ text: "Receiving", place: null, detail: null, tone: "brand" });
    expect(stateWords(download(1, { choice: { kind: "drive", target_dir: "Receipts", name: "kit.pdf" } }))).toEqual({
      text: "Will save to",
      place: { kind: "drive", rel: "Receipts" },
      detail: null,
      tone: "brand",
    });
    expect(stateWords(download(1, { choice: { kind: "path", path: "/Users/s/Desktop/a.pdf" } })).place).toEqual({
      kind: "folder",
      name: "Desktop",
    });
  });

  test("ready waits for a choice, or says why a delivery did not land", () => {
    expect(stateWords(download(1, { state: "ready" })).text).toBe("Waiting for a choice");
    expect(stateWords(download(1, { state: "ready", error: "a file is already there" }))).toEqual({
      text: "Not saved",
      place: null,
      detail: "a file is already there",
      tone: "error",
    });
  });

  test("delivering names where it is going", () => {
    const d = download(1, { state: "delivering", choice: { kind: "drive", target_dir: "" } });
    expect(stateWords(d)).toMatchObject({ text: "Saving to", place: { kind: "drive", rel: "" } });
  });

  test("saved names the Drive folder it landed in or the folder; a failed conversion is a detail, not a failure", () => {
    const inDrive = download(1, {
      state: "saved",
      saved_to: { kind: "drive", outcome: upload },
    });
    expect(stateWords(inDrive)).toEqual({
      text: "Saved to",
      place: { kind: "drive", rel: "courses/X/Labs" },
      detail: null,
      tone: "success",
    });
    const unconverted = download(1, {
      state: "saved",
      saved_to: { kind: "drive", outcome: { ...upload, error: "added, but not converted" } },
    });
    expect(stateWords(unconverted)).toMatchObject({ tone: "success", detail: "added, but not converted" });
    const onDisk = download(1, { state: "saved", saved_to: { kind: "path", path: "C:\\Users\\s\\Downloads\\a.pdf" } });
    expect(stateWords(onDisk).place).toEqual({ kind: "folder", name: "Downloads" });
    const topLevel = download(1, {
      state: "saved",
      saved_to: { kind: "drive", outcome: { ...upload, file: { ...upload.file, relative_path: "a.pdf" } } },
    });
    expect(stateWords(topLevel).place).toEqual({ kind: "drive", rel: "" });
  });

  test("discarded and failed", () => {
    expect(stateWords(download(1, { state: "discarded" }))).toEqual({ text: "Discarded", place: null, detail: null, tone: "muted" });
    expect(stateWords(download(1, { state: "failed", error: "the download did not finish" }))).toEqual({
      text: "Failed",
      place: null,
      detail: "the download did not finish",
      tone: "error",
    });
  });

  test("a refused playlist says why in Rust's words, and counts no bytes", () => {
    const refused = download(1, {
      name: "master.m3u8",
      state: "refused",
      error: "this is a video stream's playlist, not the video itself",
    });
    expect(stateWords(refused)).toEqual({
      text: "Not downloaded",
      place: null,
      detail: "this is a video stream's playlist, not the video itself",
      tone: "error",
    });
    expect(sizeWords(refused)).toBeNull();
  });
});

describe("sizeWords", () => {
  test("bytes so far while receiving, the final size after; never a total", () => {
    expect(sizeWords(download(1, { received: 4.2 * 1024 * 1024 }))).toBe("4.2 MB received");
    expect(sizeWords(download(1, { state: "ready", received: 2048 }))).toBe("2.0 KB");
  });
});

test("which rows wait, which are done with, and which ended with nothing kept", () => {
  const by = (state: Parameters<typeof download>[1]) => download(1, state);
  expect(isWaiting(by({ state: "receiving" }))).toBe(true);
  expect(isWaiting(by({ state: "receiving", choice: { kind: "discard" } }))).toBe(false);
  expect(isWaiting(by({ state: "ready" }))).toBe(true);
  for (const state of ["saved", "discarded", "failed", "refused"] as const) {
    expect(isWaiting(by({ state }))).toBe(false);
    expect(isSettled(by({ state }))).toBe(true);
  }
  for (const state of ["receiving", "ready", "delivering"] as const) expect(isSettled(by({ state }))).toBe(false);
  expect(isProblem(by({ state: "failed" }))).toBe(true);
  expect(isProblem(by({ state: "refused" }))).toBe(true);
  expect(isProblem(by({ state: "discarded" }))).toBe(false);
});

test("folderOf takes the parent of either separator", () => {
  expect(folderOf("/Users/s/Downloads/a.pdf")).toBe("Downloads");
  expect(folderOf("D:\\Work\\a.pdf")).toBe("Work");
  expect(folderOf("a.pdf")).toBe("a.pdf");
});
