import { expect, test } from "bun:test";
import { pickDriveFolder, useDrivePicker } from "@/stores/shell/drivePickerStore";

/** The request the dialog is showing. */
const open = () => useDrivePicker.getState().pending!.request;

test("a request waits for the dialog's answer", async () => {
  const asked = pickDriveFolder({ title: "Move to", action: "Move here", start: "Videos" });
  expect(useDrivePicker.getState().pending?.request.start).toBe("Videos");
  useDrivePicker.getState().settle(open(), { targetDir: "Receipts", name: null });
  expect(await asked).toEqual({ targetDir: "Receipts", name: null });
  expect(useDrivePicker.getState().pending).toBeNull();
});

test("a cancel answers null", async () => {
  const asked = pickDriveFolder({ title: "Save to Drive", action: "Save", name: "a.pdf" });
  useDrivePicker.getState().settle(open(), null);
  expect(await asked).toBeNull();
});

test("a second request cancels the one still open", async () => {
  const first = pickDriveFolder({ title: "Move to", action: "Move here" });
  const second = pickDriveFolder({ title: "Render Final", action: "Render", name: "v.mp4" });
  expect(await first).toBeNull();
  expect(useDrivePicker.getState().pending?.request.title).toBe("Render Final");
  useDrivePicker.getState().settle(open(), { targetDir: "", name: "v.mp4" });
  expect(await second).toEqual({ targetDir: "", name: "v.mp4" });
});

test("a cancelled request's late answer never reaches the request that replaced it", async () => {
  const first = pickDriveFolder({ title: "Save to Drive", action: "Save", name: "a.pdf" });
  const asked = open();
  // Its confirm is still making a folder when another caller asks.
  const second = pickDriveFolder({ title: "Render Final", action: "Render", name: "v.mp4" });
  expect(await first).toBeNull();
  useDrivePicker.getState().settle(asked, { targetDir: "Receipts", name: "a.pdf" });
  expect(useDrivePicker.getState().pending?.request.title).toBe("Render Final");
  useDrivePicker.getState().settle(open(), { targetDir: "Videos", name: "v.mp4" });
  expect(await second).toEqual({ targetDir: "Videos", name: "v.mp4" });
});
