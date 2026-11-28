import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { useSideNavPanel } from "@/hooks/ui/useSideNavPanel";
import { cn } from "@/lib/utils";

/**
 * Shared page frame: dock on wide panes, cover the content on narrow ones.
 * The drawer has no close button, so it never covers a nav control; the
 * blurred backdrop, Escape and the panel toggle dismiss it.
 */
export function SideNavShell({ panel, nav, children, className }: {
  panel: ReturnType<typeof useSideNavPanel>;
  nav: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const drawer = useRef<HTMLDivElement>(null);
  const showing = panel.overlay && !panel.collapsed;

  useLayoutEffect(() => {
    if (!showing) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawer.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected && previous.getClientRects().length) previous.focus();
    };
  }, [showing]);

  return (
    <div ref={panel.ref} data-side-nav-shell className={cn("relative isolate flex h-full min-w-0 overflow-hidden", className)}>
      {showing && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close sidebar"
          onClick={panel.dismiss}
          className="absolute inset-0 z-20 bg-black/25 backdrop-blur-[6px]"
        />
      )}
      <div
        ref={drawer}
        tabIndex={showing ? -1 : undefined}
        data-side-nav-overlay={panel.overlay || undefined}
        inert={panel.collapsed}
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
          panel.overlay && "absolute inset-y-0 left-0 z-30 max-w-[calc(100%-2rem)] overflow-hidden [&>nav]:max-w-full [&>[role=separator]]:hidden",
          showing && "bg-background shadow-xl",
        )}
      >
        {nav}
      </div>
      <div inert={showing} className="flex h-full min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
