import { expect, test } from "bun:test";
import { pickDriveFolder, useDrivePicker } from "@/stores/shell/drivePickerStore";

test("a request waits for the dialog's answer", async () => {
  const asked = pickDriveFolder({ title: "Move to", action: "Move here", start: "Videos" });
  expect(useDrivePicker.getState().pending?.request.start).toBe("Videos");
  useDrivePicker.getState().settle({ targetDir: "Receipts", name: null });
  expect(await asked).toEqual({ targetDir: "Receipts", name: null });
  expect(useDrivePicker.getState().pending).toBeNull();
});

test("a cancel answers null", async () => {
  const asked = pickDriveFolder({ title: "Save to Drive", action: "Save", name: "a.pdf" });
  useDrivePicker.getState().settle(null);
  expect(await asked).toBeNull();
});

test("a second request cancels the one still open", async () => {
  const first = pickDriveFolder({ title: "Move to", action: "Move here" });
  const second = pickDriveFolder({ title: "Render Final", action: "Render", name: "v.mp4" });
  expect(await first).toBeNull();
  expect(useDrivePicker.getState().pending?.request.title).toBe("Render Final");
  useDrivePicker.getState().settle({ targetDir: "", name: "v.mp4" });
  expect(await second).toEqual({ targetDir: "", name: "v.mp4" });
});
