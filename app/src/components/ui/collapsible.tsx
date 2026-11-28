import { createContext, useContext, type ComponentProps } from "react";
import { Fold } from "@/components/ui/Fold";

type CollapsibleState = { open: boolean; toggle: () => void };

const CollapsibleContext = createContext<CollapsibleState>({ open: false, toggle: () => {} });

/** A disclosure whose content eases open and shut in a `Fold`; the caller
 *  owns `open`. */
function Collapsible({
  open,
  onOpenChange,
  ...props
}: ComponentProps<"div"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <CollapsibleContext.Provider value={{ open, toggle: () => onOpenChange(!open) }}>
      <div data-slot="collapsible" data-state={open ? "open" : "closed"} {...props} />
    </CollapsibleContext.Provider>
  );
}

function CollapsibleTrigger({ onClick, ...props }: ComponentProps<"button">) {
  const { open, toggle } = useContext(CollapsibleContext);
  return (
    <button
      type="button"
      data-slot="collapsible-trigger"
      data-state={open ? "open" : "closed"}
      aria-expanded={open}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) toggle();
      }}
      {...props}
    />
  );
}

function CollapsibleContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const { open } = useContext(CollapsibleContext);
  return (
    <Fold open={open} className={className}>
      {children}
    </Fold>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
