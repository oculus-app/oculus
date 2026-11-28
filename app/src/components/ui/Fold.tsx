import { useRef, useState, type ReactNode } from "react";
import { useFoldMotion } from "@/hooks/ui/useFoldMotion";
import { cn } from "@/lib/utils";

/**
 * A disclosure's body, easing open and shut under its header as the chat's
 * "Worked for" fold does (`useFoldMotion`). Every change of `open` animates;
 * the first draw does not. Shut, it keeps drawing what it last showed until
 * the close finishes, so a caller may drop its content as soon as it closes.
 * Space above or below goes in its padding, never a child's margin, which
 * the animation's clip would measure differently from the settled body.
 */
export function Fold({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  const motion = useFoldMotion(open);
  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    motion.animateNext(open);
  }
  const shown = useRef(children);
  if (open) shown.current = children;
  if (!motion.mounted) return null;
  return (
    <div ref={motion.body} inert={!open} className={cn("will-change-[opacity,transform]", className)}>
      {open ? children : shown.current}
    </div>
  );
}
