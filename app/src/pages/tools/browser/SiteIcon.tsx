import { Globe, MagnifyingGlass } from "@phosphor-icons/react";
import { faviconFor } from "@/hooks/shell/useBrowserTabs";
import { useBrowserStore } from "@/stores/shell/browserStore";

/** What stands for an address: the site's cached favicon, a globe until the
 *  browser has seen the site, or a magnifier when the address is a search. */
export function SiteIcon({ url, search }: { url: string | undefined; search?: boolean }) {
  const icon = useBrowserStore((s) => faviconFor(url, s.favicons));
  return (
    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted-foreground">
      {search ? (
        <MagnifyingGlass size={13} />
      ) : icon ? (
        <img src={icon} alt="" className="h-3.5 w-3.5 rounded-[2px] object-contain" />
      ) : (
        <Globe size={13} />
      )}
    </span>
  );
}
