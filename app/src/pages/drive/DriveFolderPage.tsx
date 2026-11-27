import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { DriveBrowser } from "@/components/drive";
import { SideNavCollapseToggle } from "@/components/ui/layout/SideNav";
import { useDrivePanel } from "@/layouts/DriveLayout";
import { resolveLegacyDriveRoute } from "@/lib/drive/legacyRoutes";
import { listFolder } from "@/lib/drive/listing";
import { driveFolderHref, parseDriveRoute } from "@/lib/drive/routes";

/**
 * One folder of Drive, the data folder from its top level: the route's path
 * is the folder (`/drive/courses/<code>/…`, `/drive/Videos`,
 * `app/src/lib/drive/routes.ts`). A route saved before the top level was the
 * data folder (`/drive/<code>/…`, `/drive/recent`) is replaced by where it
 * points now, unless the student has a folder by that name.
 */
export default function DriveFolderPage() {
  const panel = useDrivePanel();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const folder = parseDriveRoute(pathname) ?? "";

  useEffect(() => {
    let live = true;
    const exists = (rel: string) => listFolder(rel).then(() => true, () => false);
    void resolveLegacyDriveRoute(folder, exists).then((target) => {
      if (live && target != null) navigate(target, { replace: true });
    });
    return () => {
      live = false;
    };
  }, [folder, navigate]);

  return (
    <DriveBrowser
      root=""
      folder={folder}
      folderHref={driveFolderHref}
      leading={<SideNavCollapseToggle panel={panel} />}
    />
  );
}
