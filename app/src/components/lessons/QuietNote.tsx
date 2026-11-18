/** A centred, muted two-line note where a slide's content would be: what is
 *  missing, then what brings it. */
export function QuietNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/70">{detail}</p>
    </div>
  );
}
