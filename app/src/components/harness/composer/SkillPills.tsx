import { FilmSlate, GraduationCap, SquaresFour } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSkillStore } from "@/stores/chat/skillStore";

const PILLS = [
  { label: "Make a video", icon: FilmSlate, skill: "oculus-studio" },
  { label: "Make a widget", icon: SquaresFour, skill: null },
  { label: "Learn", icon: GraduationCap, skill: null },
];

export function SkillPills({
  active = [],
  onToggle,
}: {
  /** Skill names currently present as chips in the composer. */
  active?: readonly string[];
  onToggle: (name: string) => void;
}) {
  const names = useSkillStore((s) => s.names);
  return (
    <div className="flex max-w-full overflow-x-auto scrollbar-none">
      <div className="mx-auto flex flex-nowrap items-center gap-2">
        {PILLS.map(({ label, icon: Icon, skill }) => {
          const isActive = skill != null && active.includes(skill);
          return (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={skill ? isActive : undefined}
                    disabled={!skill || (!isActive && !names?.has(skill))}
                    className={cn(
                      "whitespace-nowrap",
                      isActive &&
                        "border-brand/45 bg-brand-muted text-brand hover:bg-brand-muted hover:text-brand dark:border-brand/50 dark:bg-brand-muted dark:hover:bg-brand-muted",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => skill && onToggle(skill)}
                  >
                    <Icon weight={isActive ? "fill" : "regular"} />
                    {label}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!skill ? "Coming soon" : isActive ? `Remove the ${skill} skill` : `Use the ${skill} skill`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
