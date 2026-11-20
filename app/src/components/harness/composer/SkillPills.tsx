import { FilmSlate, GraduationCap, SquaresFour } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSkillStore } from "@/stores/chat/skillStore";

const PILLS = [
  { label: "Make a video", icon: FilmSlate, skill: "oculus-studio" },
  { label: "Make a widget", icon: SquaresFour, skill: null },
  { label: "Learn", icon: GraduationCap, skill: null },
];

export function SkillPills({ onPick }: { onPick: (name: string) => void }) {
  const names = useSkillStore((s) => s.names);
  return (
    <div className="flex flex-wrap justify-center gap-2 py-4">
      {PILLS.map(({ label, icon: Icon, skill }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <span>
              <Button type="button" variant="outline" size="sm"
                disabled={!skill || !names?.has(skill)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => skill && onPick(skill)}>
                <Icon />{label}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{skill ? "Use the oculus-studio skill" : "Coming soon"}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
