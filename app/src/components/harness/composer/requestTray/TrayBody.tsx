import { ChatText } from "@phosphor-icons/react";
import { CodeText } from "@/components/markdown/MdComponents";
import { DiffText } from "@/components/harness/timeline/request/DiffBlock";
import { changeKindLabel, diffStat, type RequestChange, type RequestDetail } from "@/lib/harness";
import { cn } from "@/lib/utils";
import { RevealButton, TrayClip } from "./TrayClip";

/** Files drawn in the tray; the rest are counted, and read in the row. */
const TRAY_FILES = 3;

/**
 * The whole ask, in the approval tray: `RequestBody`'s pieces without the
 * network and sandbox lines (the tray's chips say those), and every
 * tall block (a command, a diff, a tool's arguments) clipped (`TrayClip`),
 * so the tray never grows past a few lines. `onReveal` opens the request's
 * row in the timeline, where the whole of it is read.
 */
export function TrayBody({ detail, danger, onReveal }: { detail: RequestDetail; danger: boolean; onReveal?: () => void }) {
  const files = detail.changes.slice(0, TRAY_FILES);
  const hidden = detail.changes.length - files.length;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-selectable>
      {detail.command != null && (
        <div className="min-w-0">
          <TrayClip text={detail.command} onReveal={onReveal}>
            <CodeText className="break-all px-2.5 text-[11.5px] text-foreground/90">
              <span aria-hidden className={cn("select-none", danger ? "text-destructive" : "text-brand")}>$ </span>
              {detail.command}
            </CodeText>
          </TrayClip>
          {detail.cwd && <p className="mt-0.5 break-all text-[11px] leading-relaxed text-muted-foreground">in {detail.cwd}</p>}
        </div>
      )}
      {files.map((c) => (
        <TrayFile key={c.path} change={c} onReveal={onReveal} />
      ))}
      {hidden > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {hidden === 1 ? "1 more file" : `${hidden} more files`}
          {onReveal && (
            <>
              {" · "}
              <RevealButton onReveal={onReveal} />
            </>
          )}
        </p>
      )}
      {detail.access.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[11.5px] text-foreground/85">
          {detail.access.map((line) => (
            <li key={line} className="break-all">{line}</li>
          ))}
        </ul>
      )}
      {detail.tool && (
        <div className="min-w-0">
          <p className="break-all text-[11.5px] font-medium text-foreground/85">{detail.tool.line}</p>
          {detail.tool.note && (
            <p className="break-words text-[11px] leading-relaxed text-muted-foreground">{detail.tool.note}</p>
          )}
          {detail.tool.args && (
            <div className="mt-1">
              <TrayClip text={detail.tool.args} onReveal={onReveal}>
                <CodeText className="px-2.5 text-[11.5px] text-foreground/85">{detail.tool.args}</CodeText>
              </TrayClip>
            </div>
          )}
        </div>
      )}
      {detail.reason && (
        <p className="flex min-w-0 items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <ChatText size={12} className="mt-[3px] shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{detail.reason}</span>
        </p>
      )}
    </div>
  );
}

/** One file: its path, its kind and its "+n −m", then its diff, clipped. */
function TrayFile({ change, onReveal }: { change: RequestChange; onReveal?: () => void }) {
  const stat = change.diff ? diffStat(change.diff) : null;
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-baseline gap-1.5 text-[11.5px]">
        <span className="min-w-0 break-all font-medium text-foreground/85">{change.path}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{changeKindLabel(change)}</span>
        {stat && (
          <span className="shrink-0 text-[11px] tabular-nums">
            <span className="text-success">+{stat.add}</span> <span className="text-destructive">−{stat.remove}</span>
          </span>
        )}
      </p>
      {change.diff && (
        <div className="mt-1">
          <TrayClip text={change.diff} onReveal={onReveal}>
            <DiffText diff={change.diff} />
          </TrayClip>
        </div>
      )}
    </div>
  );
}
