import {
  DownloadSimple,
  Eye,
  GitBranch,
  Globe,
  HardDrives,
  Key,
  LockKeyOpen,
  PencilSimple,
  StopCircle,
  Trash,
  UserGear,
  Warning,
  type Icon,
} from "@phosphor-icons/react";
import type { RiskChip, RiskIcon, RiskTone } from "@/lib/harness";
import { cn } from "@/lib/utils";

const ICON: Record<RiskIcon, Icon> = {
  read: Eye,
  write: PencilSimple,
  delete: Trash,
  network: Globe,
  sandbox: Warning,
  access: Key,
  admin: UserGear,
  script: DownloadSimple,
  git: GitBranch,
  disk: HardDrives,
  permissions: LockKeyOpen,
  process: StopCircle,
};

const TONE: Record<RiskTone, string> = {
  safe: "bg-success/15 text-success",
  caution: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
};

/** The facts `requestRisk` found, as small tinted pills in their tone. */
export function RiskChips({ chips }: { chips: RiskChip[] }) {
  if (chips.length === 0) return null;
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {chips.map((chip) => {
        const IconC = ICON[chip.icon];
        return (
          <span
            key={chip.label}
            data-risk={chip.tone}
            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none", TONE[chip.tone])}
          >
            <IconC size={11} weight="bold" className="shrink-0" aria-hidden />
            {chip.label}
          </span>
        );
      })}
    </span>
  );
}
