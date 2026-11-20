import { Navigate, useParams } from "react-router-dom";
import { videoHref } from "@/lib/studio/routes";

/** Any path below a video's own (a saved tab, a stale link) opens the video. */
export default function VideoRedirect() {
  const { slug = "" } = useParams();
  return <Navigate to={videoHref(slug)} replace />;
}
