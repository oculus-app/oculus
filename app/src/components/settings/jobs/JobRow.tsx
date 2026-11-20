import { Stack, StackPlus } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_JOB_MODELS, type JobChain, type JobId } from "@/lib/db";
import { reasoningLabel, type PickerProvider, type Provider } from "@/lib/harness";
import { ChainPicker } from "./ChainPicker";
import { JobAttention } from "./JobAttention";
import { modelLabel, startingProvider, withEntry } from "./chain";

/** One job: what it does, what the audit found, and its first model, with
 *  the fallbacks one click away in `JobModelsDialog`. */
export function JobRow({
  job,
  label,
  description,
  chain,
  providers,
  onChange,
  onView,
  onFallbacks,
}: {
  job: JobId;
  label: string;
  description: string;
  chain: JobChain;
  providers: PickerProvider[];
  onChange: (edit: (chain: JobChain) => JobChain) => void;
  onView: (provider: Provider) => void;
  onFallbacks: () => void;
}) {
  const off = chain.length === 0;
  const rest = chain.slice(1);
  const describe = (e: JobChain[number]) =>
    [
      modelLabel(providers, e.provider, e.model),
      e.reasoningEffort && reasoningLabel(e.reasoningEffort),
    ]
      .filter(Boolean)
      .join(" ");
  const restTip = rest.length > 0
    ? `Then ${rest.map(describe).join(", then ")}`
    : "Add fallbacks";
  const restLabel = rest.length > 0 ? `${rest.length} fallbacks` : "Add fallbacks";

  return (
    <div className="settings-row flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-foreground">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        <JobAttention job={job} off={off} providers={providers} />
      </div>
      {/* A fixed width, so a long model name truncates instead of narrowing
          the description, and every row's text wraps at the same edge. */}
      <div className="settings-actions -mr-1.5 flex w-56 shrink-0 items-center justify-end gap-0.5">
        <ChainPicker
          providers={providers}
          entry={chain[0] ?? null}
          fallbackProvider={startingProvider(DEFAULT_JOB_MODELS[job], providers)}
          onPick={(pick) => onChange((c) => withEntry(c, 0, pick))}
          onView={onView}
          align="end"
          emptyLabel="None"
          emptyIcon={null}
          className="min-w-0 max-w-full"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Always icon-sized, the count a badge on the icon, so every
                row's model picker lines up. */}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={restLabel}
              onClick={onFallbacks}
              className="relative text-muted-foreground hover:text-foreground"
            >
              {rest.length > 0 ? (
                <>
                  <Stack className="size-3.5" />
                  <span className="absolute right-0 top-0 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-[3px] text-[9px] font-medium leading-none tabular-nums text-primary-foreground">
                    {rest.length}
                  </span>
                </>
              ) : (
                <StackPlus className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{restTip}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
