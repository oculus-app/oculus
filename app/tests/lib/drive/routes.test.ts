import { expect, test } from "bun:test";
import { DRIVE_RECENT_HREF, driveFolderHref, filesFolderHref, parseDriveRoute, parseFilesRoute } from "@/lib/drive/routes";
import { resolveLegacyDriveRoute } from "@/lib/drive/legacyRoutes";
import { filePagePath, fileRouteSubject, TOP_LEVEL_FILE_ROUTE } from "@/lib/files/labels";
import { TOP_LEVEL } from "@/lib/files/libraryLayout";

test("Drive routes are the data-dir-relative folder, a segment at a time", () => {
  expect(driveFolderHref("")).toBe("/drive");
  expect(driveFolderHref("courses")).toBe("/drive/courses");
  expect(driveFolderHref("Videos")).toBe("/drive/Videos");
  const rel = "courses/COMP1/Week 1/a#b?c";
  const href = driveFolderHref(rel);
  expect(href).toBe("/drive/courses/COMP1/Week%201/a%23b%3Fc");
  expect(parseDriveRoute(href)).toBe(rel);
  expect(parseDriveRoute("/drive")).toBe("");
  expect(parseDriveRoute("/drive/courses")).toBe("courses");
  expect(parseDriveRoute("/drive/Videos/Raw?x=1")).toBe("Videos/Raw");
  expect(parseDriveRoute("/drives")).toBeNull();
});

test("Drive's own pages are dot-names, which no folder it shows can take", () => {
  expect(parseDriveRoute(DRIVE_RECENT_HREF)).toBeNull();
  expect(parseDriveRoute(TOP_LEVEL_FILE_ROUTE)).toBeNull();
  expect(parseDriveRoute(`${TOP_LEVEL_FILE_ROUTE}?path=a.pdf`)).toBeNull();
  // A student's own folder may be named as Recent once was.
  expect(parseDriveRoute("/drive/recent")).toBe("recent");
});

test("a top-level file's page is Drive's; a subject's file's is its subject's", () => {
  expect(filePagePath(7, "courses/X/a b.pdf")).toBe("/subjects/7/file?path=courses%2FX%2Fa%20b.pdf");
  expect(filePagePath(TOP_LEVEL.id, "Videos/a b.pdf")).toBe("/drive/.file?path=Videos%2Fa%20b.pdf");
  expect(fileRouteSubject("/subjects/7/file")).toBe(7);
  expect(fileRouteSubject("/drive/.file")).toBe(TOP_LEVEL.id);
  expect(fileRouteSubject("/subjects/7/files")).toBeNull();
  expect(fileRouteSubject("/drive/Videos")).toBeNull();
});

test("a route saved before the top level was the data folder goes where it pointed", async () => {
  const disk = new Set(["courses/COMP1", "courses/COMP1/Course", "Videos", "recent-notes"]);
  const exists = async (rel: string) => disk.has(rel);
  expect(await resolveLegacyDriveRoute("COMP1/Course", exists)).toBe("/drive/courses/COMP1/Course");
  expect(await resolveLegacyDriveRoute("COMP1", exists)).toBe("/drive/courses/COMP1");
  expect(await resolveLegacyDriveRoute("recent", exists)).toBe(DRIVE_RECENT_HREF);
  // What exists is the student's, and what is already a new route stays.
  expect(await resolveLegacyDriveRoute("Videos", exists)).toBeNull();
  expect(await resolveLegacyDriveRoute("", exists)).toBeNull();
  expect(await resolveLegacyDriveRoute("courses", exists)).toBeNull();
  expect(await resolveLegacyDriveRoute("courses/GONE1", exists)).toBeNull();
  expect(await resolveLegacyDriveRoute("Nowhere", exists)).toBeNull();
  disk.add("recent");
  expect(await resolveLegacyDriveRoute("recent", exists)).toBeNull();
});

test("Files routes round-trip a folder inside a subject", () => {
  expect(filesFolderHref(3, "")).toBe("/subjects/3/files");
  const href = filesFolderHref(3, "Course/Files/Week 2");
  expect(href).toBe("/subjects/3/files/Course/Files/Week%202");
  expect(parseFilesRoute(href)).toEqual({ subjectId: 3, inner: "Course/Files/Week 2" });
  expect(parseFilesRoute("/subjects/3/files")).toEqual({ subjectId: 3, inner: "" });
  expect(parseFilesRoute("/subjects/3/file?path=x")).toBeNull();
});
