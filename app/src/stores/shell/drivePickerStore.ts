import { create } from "zustand";
import type { DrivePick, DrivePickerRequest } from "@/lib/drive/picker";

interface Pending {
  request: DrivePickerRequest;
  resolve: (pick: DrivePick | null) => void;
}

interface DrivePickerState {
  pending: Pending | null;
  /** The dialog's answer: a pick, or null for a cancel. */
  settle: (pick: DrivePick | null) => void;
}

/** The Drive picker's one open request. Every caller asks here
 *  (`pickDriveFolder`) and one dialog in `AppLayout` answers. */
export const useDrivePicker = create<DrivePickerState>((set, get) => ({
  pending: null,
  settle: (pick) => {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(pick);
  },
}));

/**
 * Ask the student for a folder in Drive. Resolves to the folder (and the
 * edited name, when the request gave one), or null when they cancel. A
 * request made while another is open cancels the earlier one.
 */
export function pickDriveFolder(request: DrivePickerRequest): Promise<DrivePick | null> {
  return new Promise((resolve) => {
    useDrivePicker.getState().pending?.resolve(null);
    useDrivePicker.setState({ pending: { request, resolve } });
  });
}
