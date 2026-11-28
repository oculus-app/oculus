import { pickDriveFolder } from "@/stores/shell/drivePickerStore";
import { useRenderStore } from "@/stores/studio/renderStore";
import { PRESET_LABEL } from "./exports";
import { exportStatus, exportSuggestion, type RenderPreset } from "./render";

/**
 * Start a render of `preset`. A Draft just renders. A Final or Small render
 * goes into Drive: over its Drive file without asking when it has one,
 * otherwise where the Drive picker answers, opened on the suggested folder
 * (made only if the student renders there). Cancel in the picker cancels
 * the render; there is no Final or Small outside Drive.
 */
export async function renderToDrive(dir: string, slug: string, preset: RenderPreset): Promise<void> {
  const { start } = useRenderStore.getState();
  if (preset === "draft") return start(dir, slug, preset);
  let suggested;
  try {
    // Read afresh: a file deleted in Drive since the menu opened asks again.
    const linked = (await exportStatus(dir)).find((row) => row.preset === preset)?.drive;
    if (linked) return start(dir, slug, preset);
    suggested = await exportSuggestion(slug, preset);
  } catch (e) {
    useRenderStore.getState().fail(dir, preset, e instanceof Error ? e.message : String(e));
    return;
  }
  const pick = await pickDriveFolder({
    title: `Render ${PRESET_LABEL[preset]}`,
    action: "Render",
    start: suggested.targetDir,
    makeStart: true,
    name: suggested.name,
  });
  if (!pick) return;
  return start(dir, slug, preset, { targetDir: pick.targetDir, name: pick.name ?? suggested.name });
}
