import { MagnifyingGlass, X } from "@phosphor-icons/react";

/**
 * The browser's search, scoped to the folder on screen and everything below
 * it. Its keys stay its own (the browser's arrows and Delete never see
 * them), and Escape clears a query before anything else.
 */
export function DriveSearch({ query, onQuery, placeholder }: {
  query: string;
  onQuery: (query: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex h-7 w-44 min-w-24 shrink items-center gap-2 rounded-full border border-input bg-card px-3 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
      <MagnifyingGlass size={13} className="shrink-0 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && query) {
            e.preventDefault();
            onQuery("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onQuery("")}
          className="-mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={11} weight="bold" />
        </button>
      )}
    </div>
  );
}
