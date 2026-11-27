import { describe, expect, test } from "bun:test";
import { defaultDestination, settleDestination } from "@/lib/browser/downloads/destination";

describe("defaultDestination", () => {
  test("the tab's subject, else the last folder, else the top level", () => {
    expect(defaultDestination("MULT20015_2026_SM2", "Receipts")).toBe("courses/MULT20015_2026_SM2");
    expect(defaultDestination(null, "Receipts/2026")).toBe("Receipts/2026");
    expect(defaultDestination(null, null)).toBe("");
  });
});

describe("settleDestination", () => {
  /** A library where only these folders exist and take new files. */
  const library = (writable: string[]) => async (rel: string) => {
    if (rel === "courses" || rel.endsWith("/Course")) return { rel, writable: false };
    if (!writable.includes(rel)) throw new Error(`${rel} is not there`);
    return { rel, writable: true };
  };

  test("a folder that takes files is kept", async () => {
    expect(await settleDestination("Receipts", library(["Receipts"]))).toBe("Receipts");
    expect(await settleDestination("", library([]))).toBe("");
  });

  test("a gone or synced folder steps up to one that does", async () => {
    const lib = library(["courses/X", "Receipts"]);
    expect(await settleDestination("Receipts/2025/Old", lib)).toBe("Receipts");
    expect(await settleDestination("courses/X/Course", lib)).toBe("courses/X");
  });

  test("never the folder of subjects: a gone subject lands at the top level", async () => {
    expect(await settleDestination("courses/GONE", library([]))).toBe("");
  });
});
