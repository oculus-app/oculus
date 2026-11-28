import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { useSideNavPanel } from "@/hooks/ui/useSideNavPanel";
import { cn } from "@/lib/utils";

/**
 * Shared page frame: dock on wide panes, cover the content on narrow ones.
 * The drawer opens below the page's top row (`PaneHeaderRow`), as it does
 * under the side panel's header, so the row's nav toggle stays in reach and
 * closes it; the blurred backdrop and Escape dismiss it too. The rest of the
 * page is inert while it shows.
 */
export function SideNavShell({ panel, nav, children, className }: {
  panel: ReturnType<typeof useSideNavPanel>;
  nav: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const drawer = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const showing = panel.overlay && !panel.collapsed;

  useLayoutEffect(() => {
    const shell = panel.ref.current;
    const page = content.current;
    if (!showing || !shell || !page) return;
    const header = topRow(shell, page);
    setTop(header?.offsetHeight ?? 0);
    const frozen = header ? inertAround(page, header) : inertAll(page);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawer.current?.focus({ preventScroll: true });
    return () => {
      for (const el of frozen) el.inert = false;
      if (previous?.isConnected && previous.getClientRects().length) previous.focus();
    };
  }, [showing, panel.ref]);

  const below = showing && top > 0 ? { top } : undefined;

  return (
    <div ref={panel.ref} data-side-nav-shell className={cn("relative isolate flex h-full min-w-0 overflow-hidden", className)}>
      {showing && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close sidebar"
          onClick={panel.dismiss}
          style={below}
          className="absolute inset-0 z-20 bg-black/25 backdrop-blur-[6px]"
        />
      )}
      <div
        ref={drawer}
        tabIndex={showing ? -1 : undefined}
        data-side-nav-overlay={panel.overlay || undefined}
        inert={panel.collapsed}
        style={below}
        onKeyDown={(event) => {
          if (showing && event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            panel.dismiss();
          }
        }}
        onClick={(event) => {
          if (showing && event.target instanceof Element && event.target.closest("a[href], [data-tab-href], [data-side-nav-close]")) panel.dismiss();
        }}
        className={cn(
          "relative flex h-full shrink-0 outline-none",
          panel.overlay && "absolute inset-y-0 left-0 z-30 h-auto max-w-[calc(100%-2rem)] overflow-hidden [&>nav]:max-w-full [&>[role=separator]]:hidden",
          showing && "bg-background shadow-xl",
        )}
      >
        {nav}
      </div>
      <div ref={content} className="flex h-full min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}

/** The page's top row when it sits flush with the shell's top edge. Layout offsets, not rects, so page zoom can't skew it. */
function topRow(shell: HTMLElement, page: HTMLElement): HTMLElement | null {
  const row = page.querySelector<HTMLElement>("[data-pane-header]");
  if (!row || row.offsetHeight === 0) return null;
  let y = 0;
  let node: Element | null = row;
  while (node instanceof HTMLElement && node !== shell) {
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return node === shell && y === 0 ? row : null;
}

/** Makes everything under `root` inert except `keep`'s subtree; returns what it froze. */
function inertAround(root: HTMLElement, keep: HTMLElement): HTMLElement[] {
  const frozen: HTMLElement[] = [];
  for (let node: HTMLElement = keep; node !== root && node.parentElement; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
        sibling.inert = true;
        frozen.push(sibling);
      }
    }
  }
  return frozen;
}

function inertAll(root: HTMLElement): HTMLElement[] {
  if (root.inert) return [];
  root.inert = true;
  return [root];
}
