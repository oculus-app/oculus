import { useDrivePicker } from "@/stores/shell/drivePickerStore";
import { DrivePickerDialog } from "./DrivePickerDialog";

/** The app's one Drive picker, answering whoever called `pickDriveFolder`. */
export function DrivePickerHost() {
  const request = useDrivePicker((s) => s.pending?.request ?? null);
  const settle = useDrivePicker((s) => s.settle);
  return <DrivePickerDialog request={request} onResult={settle} />;
}
