import { create } from "zustand";
import { getSetting, setSetting } from "@/lib/db";
import {
  SEARCH_ENGINES,
  setOpenLinksInSystem,
  setSearchEngine,
} from "@/lib/browser";
import type { LastDestination } from "@/lib/browser/downloads/types";

/** Browser preferences: search engine, where links open, and which answer
 *  the Save dialog preselects for a download. Loaded from
 *  SQLite here and pushed into `lib/browser/index.ts` module values, since its
 *  callers answer synchronously and it cannot import this store. */

const ENGINE_KEY = "browser_search_engine";
const OPEN_LINKS_KEY = "browser_open_links_in";
const LAST_DESTINATION_KEY = "browser_downloads_last_destination";

export type OpenLinksIn = "oculus" | "system";

interface BrowserPrefs {
  engine: string;
  openLinksIn: OpenLinksIn;
  /** The Save dialog's last answer; preselected next time. Which folder in
   *  Drive is the picker's (`drive_picker_last_destination`). */
  lastDestination: LastDestination;
  loaded: boolean;
  load: () => Promise<void>;
  setEngine: (id: string) => Promise<void>;
  setOpenLinksIn: (where: OpenLinksIn) => Promise<void>;
  rememberDestination: (where: LastDestination) => Promise<void>;
}

export const useBrowserPrefsStore = create<BrowserPrefs>((set) => ({
  engine: SEARCH_ENGINES[0].id,
  openLinksIn: "oculus",
  lastDestination: "drive",
  loaded: false,
  load: async () => {
    const [engine, openLinks, lastDestination] = await Promise.all([
      getSetting(ENGINE_KEY),
      getSetting(OPEN_LINKS_KEY),
      getSetting(LAST_DESTINATION_KEY),
    ]);
    const id = SEARCH_ENGINES.find((e) => e.id === engine)?.id ?? SEARCH_ENGINES[0].id;
    const where: OpenLinksIn = openLinks === "system" ? "system" : "oculus";
    setSearchEngine(id);
    setOpenLinksInSystem(where === "system");
    set({
      engine: id,
      openLinksIn: where,
      lastDestination: lastDestination === "mac" ? "mac" : "drive",
      loaded: true,
    });
  },
  setEngine: async (id) => {
    setSearchEngine(id);
    set({ engine: id });
    await setSetting(ENGINE_KEY, id);
  },
  setOpenLinksIn: async (where) => {
    setOpenLinksInSystem(where === "system");
    set({ openLinksIn: where });
    await setSetting(OPEN_LINKS_KEY, where);
  },
  rememberDestination: async (where) => {
    set({ lastDestination: where });
    await setSetting(LAST_DESTINATION_KEY, where);
  },
}));
