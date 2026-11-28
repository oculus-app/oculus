import { useRef, type ReactNode } from "react";
import { useScrollFade } from "@/hooks/ui/useScrollFade";
import { TaskSearch } from "./TaskSearch";

/** Search stays above the filter strip when this pane cannot fit both.
 *  `end` (a New button) sits after the strip, outside its sideways scroll,
 *  so it never scrolls out of reach. */
export function TaskToolbar({ value, onChange, placeholder, children, end }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  children: ReactNode;
  end?: ReactNode;
}) {
  const actions = useRef<HTMLDivElement>(null);
  useScrollFade(actions, "x");
  return (
    <div className="task-toolbar shrink-0 min-w-0">
      <div className="task-toolbar-layout">
        <div className="task-toolbar-search">
          <TaskSearch value={value} onChange={onChange} placeholder={placeholder} />
        </div>
        <div className="task-toolbar-row">
          <div ref={actions} role="group" aria-label="List controls" className="task-toolbar-actions">
            <div className="task-toolbar-controls">{children}</div>
          </div>
          {end && <div className="task-toolbar-end">{end}</div>}
        </div>
      </div>
    </div>
  );
}
