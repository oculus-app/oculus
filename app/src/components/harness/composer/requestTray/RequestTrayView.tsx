import { useMemo, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { requestActions, requestDetail, requestRisk, type HarnessRequest, type RequestOption } from "@/lib/harness";
import { shortcut } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { KeyCap } from "../KeyCap";
import { RiskChips } from "./RiskChips";
import { TrayBody } from "./TrayBody";

/** Session grants drawn as buttons; past this they go under More. */
const INLINE_MORE = 2;
/** Dots past this say nothing the count does not. */
const MAX_DOTS = 5;

const optionTitle = (option: RequestOption) => [option.label, option.scope].filter(Boolean).join(" — ");

/**
 * The approval tray as drawn, given the request (tests render it alone):
 * the agent's mark, the title, the risk chips and "1 of 3"; the whole ask
 * (`TrayBody`); then a session grant per button, Deny and Allow with their
 * keys. A `danger` request is washed red and its default flips: Enter is on
 * Deny, and Allow is an outline with no key. Rust's refusal is a red line
 * inside it, never a toast.
 */
export function RequestTrayView({
  rootRef,
  request,
  count,
  busy,
  error,
  onRespond,
  onReveal,
}: {
  rootRef?: React.Ref<HTMLDivElement>;
  request: HarnessRequest;
  count: number;
  busy: boolean;
  error: string | null;
  onRespond: (option: RequestOption) => void;
  /** Opens the request's row in the timeline. */
  onReveal?: () => void;
}) {
  const detail = useMemo(() => requestDetail(request), [request]);
  const risk = useMemo(() => requestRisk(request, detail), [request, detail]);
  const actions = requestActions(request);
  const danger = risk.tone === "danger";
  const enter = shortcut("enter");

  const deny = actions.decline && (
    <Button
      size="xs"
      variant={danger ? "default" : "outline"}
      disabled={busy}
      title={actions.decline.label}
      onClick={() => onRespond(actions.decline!)}
      className="will-change-[opacity]"
    >
      Deny
      {danger ? <KeyCap fill>{enter}</KeyCap> : <KeyCap>esc</KeyCap>}
    </Button>
  );
  const allow = actions.approve && (
    <Button
      size="xs"
      variant={danger ? "outline" : "default"}
      disabled={busy}
      title={optionTitle(actions.approve)}
      onClick={() => onRespond(actions.approve!)}
      className={cn("will-change-[opacity]", danger && "text-destructive hover:text-destructive")}
    >
      Allow
      {!danger && <KeyCap fill>{enter}</KeyCap>}
    </Button>
  );

  return (
    <div
      ref={rootRef}
      data-request-bar={request.id}
      data-risk={risk.tone}
      className={cn("flex flex-col gap-2 rounded-t-[inherit] px-3.5 pb-2.5 pt-2.5", danger && "bg-destructive/[0.07]")}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ProviderMark provider={request.provider} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground" title={detail.title}>
          {detail.title}
        </span>
        <RiskChips chips={risk.chips} />
        {count > 1 && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] tabular-nums text-muted-foreground">1 of {count}</span>
            <span aria-hidden className="flex gap-[3px]">
              {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, i) => (
                <span key={i} className={cn("size-[5px] rounded-full", i === 0 ? "bg-brand" : "bg-muted-foreground/40")} />
              ))}
            </span>
          </span>
        )}
      </div>
      <TrayBody detail={detail} danger={danger} onReveal={onReveal} />
      {error && (
        <p role="alert" className="break-words text-[11px] leading-relaxed text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <SessionGrants options={actions.more} busy={busy} onRespond={onRespond} />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {danger ? (
            <>
              {allow}
              {deny}
            </>
          ) : (
            <>
              {deny}
              {allow}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Answers that reach past this call (Codex's "Always allow this exact
 *  command"), each a quiet button with its scope; more than two under More. */
function SessionGrants({ options, busy, onRespond }: { options: RequestOption[]; busy: boolean; onRespond: (o: RequestOption) => void }) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  if (options.length <= INLINE_MORE) {
    return options.map((option) => (
      <Tooltip key={option.id}>
        <TooltipTrigger asChild>
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            title={optionTitle(option)}
            onClick={() => onRespond(option)}
            className="min-w-0 text-muted-foreground will-change-[opacity]"
          >
            <span className="truncate">{option.label}</span>
          </Button>
        </TooltipTrigger>
        {option.scope && <TooltipContent>{option.scope}</TooltipContent>}
      </Tooltip>
    ));
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" disabled={busy} className="text-muted-foreground will-change-[opacity]">
          More
          <CaretDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={8} className="w-72 max-w-[calc(100vw-16px)] p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onRespond(option);
            }}
            className="flex w-full cursor-default flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
          >
            <span className="text-xs text-foreground">{option.label}</span>
            {option.scope && <span className="text-[11px] leading-relaxed text-muted-foreground">{option.scope}</span>}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
