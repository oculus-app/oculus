import type { Ref } from "react";
import { cn } from "@/lib/utils";

const FRAME =
  "relative flex flex-col border border-border bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25";
const DROP = "border-brand ring-[3px] ring-brand/25";

/**
 * The composer's card: border, radius, ground, shadow, the focus ring and
 * the drop ring, with a waiting request's `tray` on top inside the same
 * border. The box (`className`, its own layout) is always the second child,
 * so a tray coming or going never remounts the editor in it.
 */
export function ComposerFrame({
  ref,
  radius,
  className,
  dropping,
  tray,
  stacked = false,
  onClick,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  /** The frame's corners; the tray's top corners follow them. */
  radius: string;
  className: string;
  dropping?: boolean;
  tray?: React.ReactNode;
  /** More requests wait behind the tray: two card edges peek above the frame. */
  stacked?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div ref={ref} className={cn(FRAME, radius, dropping && DROP)}>
      {tray && stacked && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-x-4 bottom-full h-[3px] rounded-t-md border border-b-0 border-border bg-surface" />
          <span aria-hidden className="pointer-events-none absolute inset-x-7 bottom-[calc(100%+3px)] h-[3px] rounded-t-md border border-b-0 border-border bg-surface opacity-60" />
        </>
      )}
      {tray && <div className="rounded-t-[inherit] border-b border-border bg-surface">{tray}</div>}
      <div className={className} onClick={onClick}>
        {children}
      </div>
    </div>
  );
}
