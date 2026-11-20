import { openBeside } from "@/lib/shell/tabRouters";
import { videoHref } from "./routes";

/** Opens a video's page in the side panel, as a file chip opens its file.
 *  Only ever a student's press: nothing opens it on its own. */
export function openVideoBeside(slug: string, title?: string | null): void {
  openBeside(videoHref(slug, title));
}
