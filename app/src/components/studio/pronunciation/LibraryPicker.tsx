import { Books } from "@phosphor-icons/react";

import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LibraryFilter } from "@/lib/studio/pronunciationView";
import { LibraryLabel } from "./LibraryLabel";

/** Radix rejects an empty-string value; no course code starts with `~`. */
const ALL = "~all";
const GLOBAL = "~global";

const toValue = (f: LibraryFilter) => (f === "all" ? ALL : f === "global" ? GLOBAL : f.code);
const fromValue = (v: string): LibraryFilter => (v === ALL ? "all" : v === GLOBAL ? "global" : { code: v });

/**
 * A choice of lexicon: Global or a subject's by course code, with All first
 * when `all` (the page's filter). The filter is the small pill; the add
 * form's matches its fields.
 */
export function LibraryPicker({ codes, value, onChange, all = false, label, size = "pill" }: {
  codes: readonly string[];
  value: LibraryFilter;
  onChange: (next: LibraryFilter) => void;
  all?: boolean;
  label: string;
  size?: "pill" | "field";
}) {
  return (
    <Select value={toValue(value)} onValueChange={(v) => onChange(fromValue(v))}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={size === "pill" ? "h-7 gap-1.5 text-xs" : "w-full justify-between rounded-lg text-[13px]"}
      >
        <SelectValue>
          {value === "all" ? (
            <span className="flex items-center gap-1.5">
              <Books size={12} />
              All libraries
            </span>
          ) : (
            <LibraryLabel subject={value === "global" ? null : value.code} className="gap-1.5" />
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="max-h-56 min-w-[9rem]">
        {all && (
          <SelectItem value={ALL} className="text-xs">
            All libraries
          </SelectItem>
        )}
        <SelectItem value={GLOBAL} className="text-xs">
          Global
        </SelectItem>
        {codes.length > 0 && <SelectSeparator />}
        {codes.map((code) => (
          <SelectItem key={code} value={code} className="gap-1.5 text-xs">
            <LibraryLabel subject={code} className="gap-1.5" />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
