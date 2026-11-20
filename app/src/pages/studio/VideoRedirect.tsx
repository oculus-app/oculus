import { Navigate, useParams } from "react-router-dom";
import { videoHref } from "@/lib/studio/routes";

/** A saved path under a video's own (a page Studio no longer has) opens the video. */
export default function VideoRedirect() {
  const { slug = "" } = useParams();
  return <Navigate to={videoHref(slug)} replace />;
}
