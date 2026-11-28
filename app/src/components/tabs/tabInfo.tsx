import { ProjectIcon } from "@/components/projects/icons/ProjectIcon";
import { parseSubjectParam } from "@/components/projects/tasks/taskViews";
import { useCallback } from "react";
import {
  ArrowClockwise,
  ArrowsClockwise,
  BookOpen,
  CalendarBlank,
  Chat,
  CheckSquare,
  ClockCounterClockwise,
  Cube,
  FileDashed,
  FilmSlate,
  Folder,
  FolderSimple,
  GearSix,
  Globe,
  House,
  Kanban,
  Lightbulb,
  ListChecks,
  Palette,
  Notebook,
  Scribble,
  Translate,
} from "@phosphor-icons/react";
import { browseId, hostOf, type BrowserTab } from "@/lib/browser";
import { faviconFor } from "@/hooks/shell/useBrowserTabs";
import { useSubjects } from "@/hooks/data/useSubjects";
import { useBrowserStore } from "@/stores/shell/browserStore";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { displayCode, humanizeSlug } from "@/lib/format/format";
import { SETTINGS_PAGES } from "@/lib/search/settings";
import type { Subject } from "@/lib/db";
import { isOwnPath, isTopLevelPath } from "@/lib/files/libraryLayout";
import { DRIVE_RECENT_HREF, parseDriveRoute, parseFilesRoute } from "@/lib/drive/routes";
import { isSubjectsFolder } from "@/lib/drive/home";
import { SUBJECTS_LABEL, TOP_LEVEL_FILE_ROUTE } from "@/lib/files/labels";
import { legacyTabTargets } from "@/lib/drive/legacyTabs";
import { subjectForFolder } from "@/lib/drive/paths";
import { pathFile } from "@/lib/files/pathCategory";

const SECTION_LABELS: Record<string, string> = {
  modules: "Modules",
  files: "Files",
  lectures: "Lectures",
  announcements: "Announcements",
  assignments: "Assignments",
  discussion: "Discussion",
  lessons: "Lessons",
};

export interface TabInfo {
  title: string;
  icon: React.ReactNode;
}

/**
 * A route's title and icon, shared by the tab strip and the new-tab page's
 * Recent list. Derived from the path on every render, so renames follow on
 * their own.
 */
export function tabInfo(
  path: string,
  subjects: Subject[],
  browserTabs: BrowserTab[],
  size = 13,
  favicons: Record<string, string> = {},
): TabInfo {
  const [pathname, search = ""] = path.split("?");
  // Browser tab icon: spinner while loading, else the site favicon, else a globe.
  const bid = browseId(pathname);
  if (bid != null) {
    const tab = browserTabs.find((t) => t.id === bid);
    const icon = faviconFor(tab?.url, favicons);
    return {
      title: tab?.title || hostOf(tab?.url ?? "") || "New tab",
      icon: tab?.loading ? (
        <ArrowClockwise size={size} className="animate-spin" />
      ) : icon ? (
        <img
          src={icon}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size }}
          className="shrink-0 rounded-[2px] object-contain"
        />
      ) : (
        <Globe size={size} />
      ),
    };
  }
  if (pathname === "/") return { title: "Home", icon: <House size={size} /> };
  if (pathname.startsWith("/revision")) return { title: pathname.includes("/review") ? "Review" : pathname.includes("/quizzes") ? "Quizzes" : pathname.includes("/artifacts") ? "Artifacts" : "Cheat sheet", icon: <Lightbulb size={size} /> };
  if (pathname === "/new")
    return { title: "New tab", icon: <FileDashed size={size} /> };
  // Chat, project and task titles ride in `?n=` (this has no lists to look up).
  if (pathname.startsWith("/chat"))
    return {
      title: new URLSearchParams(search).get("n") || "Chat",
      icon: <Chat size={size} />,
    };
  if (pathname.startsWith("/calendar"))
    return { title: "Calendar", icon: <CalendarBlank size={size} /> };
  // Task routes are tested before their prefix routes (project, task list).
  const task = /^\/projects\/(\d+)\/tasks\/\d+/.exec(pathname);
  if (task) {
    return {
      title: new URLSearchParams(search).get("n") || "Task",
      icon: <ProjectIcon project={{ id: Number(task[1]) }} size={size} />,
    };
  }
  const proj = /^\/projects\/(\d+)/.exec(pathname);
  if (proj) {
    return {
      title: new URLSearchParams(search).get("n") || "Project",
      icon: <ProjectIcon project={{ id: Number(proj[1]) }} size={size} />,
    };
  }
  if (pathname.startsWith("/projects"))
    return { title: "Projects", icon: <Kanban size={size} /> };
  if (/^\/tasks\/\d+/.test(pathname)) {
    return {
      title: new URLSearchParams(search).get("n") || "Task",
      icon: <CheckSquare size={size} />,
    };
  }
  if (pathname.startsWith("/tasks")) {
    const scope = parseSubjectParam(new URLSearchParams(search).get("subject"));
    const subject = typeof scope === "number" ? subjects.find(s => s.id === scope) : null;
    const title = scope === "personal" ? "Personal · Tasks" : subject ? `${displayCode(subject.code)} · Tasks` : "Tasks";
    return { title, icon: <ListChecks size={size} /> };
  }
  if (pathname.startsWith("/studio")) {
    // A video is titled by `?n=` when the link carries it, else by its slug.
    const video = /^\/studio\/videos\/([^/]+)/.exec(pathname);
    if (video) {
      return {
        title: new URLSearchParams(search).get("n") || humanizeSlug(decodeURIComponent(video[1])),
        icon: <FilmSlate size={size} />,
      };
    }
    const component = /^\/studio\/components\/([^/]+)/.exec(pathname);
    if (component) return { title: decodeURIComponent(component[1]), icon: <Cube size={size} /> };
    if (pathname.startsWith("/studio/components")) return { title: "Components", icon: <Cube size={size} /> };
    const theme = /^\/studio\/themes\/([^/]+)/.exec(pathname);
    if (theme) return { title: decodeURIComponent(theme[1]), icon: <Palette size={size} /> };
    if (pathname.startsWith("/studio/themes")) return { title: "Themes", icon: <Palette size={size} /> };
    if (pathname.startsWith("/studio/pronunciation")) return { title: "Pronunciation", icon: <Translate size={size} /> };
    return { title: "Videos", icon: <FilmSlate size={size} /> };
  }
  if (pathname === DRIVE_RECENT_HREF) return { title: "Recent", icon: <ClockCounterClockwise size={size} /> };
  // A top-level file has no subject: Drive's folder stands where its icon would.
  if (pathname === TOP_LEVEL_FILE_ROUTE) {
    return fileTabInfo(search, <Folder size={size} />, size) ?? { title: "Drive", icon: <Folder size={size} /> };
  }
  const driveFolder = parseDriveRoute(pathname);
  if (driveFolder != null) {
    // The folder of subjects by its label, a subject's own folder by its
    // code and icon, any other folder by its name.
    if (!driveFolder) return { title: "Drive", icon: <Folder size={size} /> };
    if (isSubjectsFolder(driveFolder)) return { title: SUBJECTS_LABEL, icon: <BookOpen size={size} /> };
    const parts = driveFolder.split("/");
    const subject = parts.length === 2 && isSubjectsFolder(parts[0]) ? subjectForFolder(parts[1], subjects) : undefined;
    if (subject) {
      return { title: displayCode(subject.code), icon: <SubjectIcon code={subject.code} size={size} /> };
    }
    return { title: parts[parts.length - 1], icon: <FolderSimple size={size} /> };
  }
  if (pathname.startsWith("/sync"))
    return { title: "Sync", icon: <ArrowsClockwise size={size} /> };
  if (pathname.startsWith("/settings")) {
    // Named for its page (`/settings/opencode` is "opencode"); the bare route,
    // which redirects, stays "Settings".
    const page = SETTINGS_PAGES.find((p) => p.id === pathname.split("/")[2]);
    return { title: page?.label ?? "Settings", icon: <GearSix size={size} /> };
  }
  const m = /^\/subjects\/(\d+)(?:\/([\w-]+))?/.exec(pathname);
  if (m) {
    const subject = subjects.find((s) => String(s.id) === m[1]);
    const icon = subject ? (
      <SubjectIcon code={subject.code} size={size} />
    ) : (
      <BookOpen size={size} />
    );
    if (m[2] === "file") {
      const file = fileTabInfo(search, icon, size);
      if (file) return file;
    }
    if (m[2] === "lecture") {
      return { title: new URLSearchParams(search).get("t") ?? "Lecture", icon };
    }
    const code = subject ? displayCode(subject.code) : "Subject";
    // A Files folder is titled by its name; the tab's root, and an old
    // sub-tab's path waiting for its redirect, are the Files tab.
    const files = m[2] === "files" ? parseFilesRoute(pathname) : null;
    if (files?.inner && !legacyTabTargets(files.inner)) {
      return { title: `${code} · ${files.inner.split("/").pop()}`, icon };
    }
    // The first segment only.
    const section = m[2] ? SECTION_LABELS[m[2]] : null;
    return { title: section ? `${code} · ${section}` : code, icon };
  }
  if (pathname.startsWith("/subjects"))
    return { title: "Subjects", icon: <BookOpen size={size} /> };
  return { title: "Oculus", icon: null };
}

/** A file page's title and icon, from its `?path=`: a file is titled by its
 *  name, and the student's own notes stay verbatim (humanising would
 *  title-case them and eat a leading date). `icon` is its home's. */
function fileTabInfo(search: string, icon: React.ReactNode, size: number): TabInfo | null {
  const rel = new URLSearchParams(search).get("path");
  const base = rel?.split("/").pop();
  if (!rel || !base) return null;
  const own = isOwnPath(rel) ? pathFile(rel).category : null;
  if (own === "whiteboard") return { title: base.replace(/\.whiteboard$/i, ""), icon: <Scribble size={size} /> };
  if (own === "notebook") return { title: base.replace(/\.notebook$/i, ""), icon: <Notebook size={size} /> };
  if (own === "document") return { title: base.replace(/\.md$/i, ""), icon };
  // A top-level upload keeps the name the student gave it.
  if (isTopLevelPath(rel)) return { title: base, icon };
  return { title: humanizeSlug(base.replace(/\.pdf$/i, "")), icon };
}

/** `tabInfo` over the app's live subjects, browser pages and favicons: what
 *  the tab strip and the side panel's header title their panes with. */
export function useTabInfo(): (path: string, size?: number) => TabInfo {
  const { subjects } = useSubjects();
  const browserTabs = useBrowserStore((s) => s.tabs);
  const favicons = useBrowserStore((s) => s.favicons);
  return useCallback(
    (path, size = 13) => tabInfo(path, subjects, browserTabs, size, favicons),
    [subjects, browserTabs, favicons],
  );
}
