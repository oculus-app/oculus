/**
 * Host-side runtime for a ```ui block's interactive attributes: one delegated
 * listener set per block and no agent-written script. State lives in this map
 * rather than the DOM so morphing streamed markup never loses picks.
 *
 * - `data-choice="f" data-value="balanced"` + `data-option="constant"`
 * - `data-scrub="s" data-options="0 1 2 3" data-edges="14.8 36.7 66"`
 * - `data-show="f=balanced s=2|3"`
 *
 * Controls stay `inert` until the fence closes, showing the default state.
 */
export class BlockRuntime {
  private picked = new Map<string, string>();
  private drag: { name: string; pointer: number; el: Element } | null = null;
  private ac = new AbortController();
  private inert = false;

  constructor(
    private root: HTMLElement,
    private onChange: () => void = () => {},
  ) {
    const on = { signal: this.ac.signal };
    root.addEventListener("click", this.click, on);
    root.addEventListener("keydown", this.key, on);
    root.addEventListener("pointerdown", this.down, on);
    root.addEventListener("pointermove", this.move, on);
    root.addEventListener("pointerup", this.up, on);
    root.addEventListener("pointercancel", this.up, on);
    root.addEventListener("lostpointercapture", this.up, on);
  }

  destroy() {
    this.drag = null;
    this.ac.abort();
  }

  setInert(inert: boolean) {
    if (this.inert === inert) return;
    this.inert = inert;
    if (inert) this.drag = null;
  }

  /** Restores saved picks for a committed block (empty starts fresh). */
  hydrate(saved: Record<string, unknown>) {
    this.picked.clear();
    for (const [k, v] of Object.entries(saved)) {
      if (typeof v === "string") this.picked.set(k, v);
    }
    if (this.root.firstChild) this.apply();
  }

  state(): Record<string, string> {
    return Object.fromEntries(this.picked);
  }

  value(name: string): string | undefined {
    const defaults = this.defaults();
    return this.inert ? defaults.get(name) : (this.picked.get(name) ?? defaults.get(name));
  }

  private defaults(): Map<string, string> {
    const out = new Map<string, string>();
    for (const el of this.root.querySelectorAll("[data-choice][data-value],[data-scrub][data-value]")) {
      const name = el.getAttribute("data-choice") ?? el.getAttribute("data-scrub")!;
      if (!out.has(name)) out.set(name, el.getAttribute("data-value")!);
    }
    for (const el of this.root.querySelectorAll("[data-option]")) {
      const name = el.closest("[data-choice]")?.getAttribute("data-choice");
      if (name && !out.has(name)) out.set(name, el.getAttribute("data-option")!);
    }
    for (const el of this.root.querySelectorAll("[data-scrub][data-options]")) {
      const name = el.getAttribute("data-scrub")!;
      const first = options(el)[0];
      if (!out.has(name) && first != null) out.set(name, first);
    }
    return out;
  }

  /** Projects current state onto runtime-owned attributes after each morph. */
  apply() {
    const defaults = this.defaults();
    const value = (name: string) => (this.inert ? defaults.get(name) : (this.picked.get(name) ?? defaults.get(name)));

    for (const el of this.root.querySelectorAll("svg[aria-label]")) set(el, "role", "img");

    for (const group of this.root.querySelectorAll("[data-choice]")) {
      const name = group.getAttribute("data-choice")!;
      set(group, "role", "radiogroup");
      toggle(group, "inert", this.inert);
      const current = value(name);
      const opts = groupOptions(group);
      const hasSelected = current !== undefined && opts.some((o) => o.getAttribute("data-option") === current);
      opts.forEach((opt, i) => {
        const on = current !== undefined && opt.getAttribute("data-option") === current;
        toggle(opt, "data-on", on);
        toggle(opt, "inert", this.inert);
        set(opt, "role", "radio");
        set(opt, "aria-checked", String(on));
        set(opt, "tabindex", !this.inert && (on || (!hasSelected && i === 0)) ? "0" : "-1");
      });
    }

    for (const el of this.root.querySelectorAll("[data-scrub]")) {
      const opts = options(el);
      const v = value(el.getAttribute("data-scrub")!);
      set(el, "role", "slider");
      toggle(el, "inert", this.inert);
      set(el, "tabindex", this.inert ? "-1" : "0");
      set(el, "aria-valuemin", "0");
      set(el, "aria-valuemax", String(Math.max(0, opts.length - 1)));
      set(el, "aria-valuenow", String(Math.max(0, opts.indexOf(v ?? ""))));
      set(el, "aria-valuetext", v ?? "");
    }

    for (const el of this.root.querySelectorAll("[data-show]")) {
      const conds = conditions(el.getAttribute("data-show") ?? "");
      const shown =
        conds.length > 0 &&
        conds.every(([name, vals]) => {
          const current = value(name);
          return current !== undefined && vals.includes(current);
        });
      toggle(el, "data-off", !shown);
    }
  }

  private pick(name: string, v: string) {
    if (this.inert) return;
    if (this.picked.get(name) === v) return;
    this.picked.set(name, v);
    this.apply();
    this.onChange();
  }

  private click = (e: MouseEvent) => {
    if (this.inert) return;
    const opt = (e.target as Element | null)?.closest?.("[data-option]");
    const group = opt?.closest("[data-choice]");
    if (opt && group && this.root.contains(group)) {
      this.pick(group.getAttribute("data-choice")!, opt.getAttribute("data-option")!);
    }
  };

  private key = (e: KeyboardEvent) => {
    if (this.inert || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as Element | null;
    if (!target) return;

    const scrub = target.closest?.("[data-scrub]");
    if (scrub && this.root.contains(scrub)) {
      const opts = options(scrub);
      if (!opts.length) return;
      const name = scrub.getAttribute("data-scrub")!;
      const at = Math.max(0, opts.indexOf(this.value(name) ?? ""));
      let nextIdx: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") nextIdx = Math.min(opts.length - 1, at + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") nextIdx = Math.max(0, at - 1);
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = opts.length - 1;
      if (nextIdx !== null) {
        this.pick(name, opts[nextIdx]);
        e.preventDefault();
      }
      return;
    }

    const opt = target.closest?.("[data-option]");
    const group = opt?.closest("[data-choice]");
    if (!opt || !group || !this.root.contains(group)) return;
    const name = group.getAttribute("data-choice")!;

    if (e.key === "Enter" || e.key === " ") {
      this.pick(name, opt.getAttribute("data-option")!);
      e.preventDefault();
      return;
    }

    const all = groupOptions(group);
    if (!all.length) return;
    const at = all.indexOf(opt);
    let next: Element | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = all[(at + 1) % all.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = all[(at - 1 + all.length) % all.length];
    else if (e.key === "Home") next = all[0];
    else if (e.key === "End") next = all[all.length - 1];
    if (!next) return;

    this.pick(name, next.getAttribute("data-option")!);
    // Move focus only when the user is already focused inside this block, never from a hidden pane.
    if (document.activeElement && this.root.contains(document.activeElement)) {
      (next as HTMLElement).focus?.();
    }
    e.preventDefault();
  };

  private down = (e: PointerEvent) => {
    if (this.inert || e.button !== 0) return;
    const scrub = (e.target as Element | null)?.closest?.("[data-scrub]");
    if (!scrub || !this.root.contains(scrub)) return;
    try {
      scrub.setPointerCapture?.(e.pointerId);
    } catch {
      /* Synthetic pointer events without an active pointer id. */
    }
    this.drag = { name: scrub.getAttribute("data-scrub")!, pointer: e.pointerId, el: scrub };
    this.scrubTo(e.clientX);
  };

  private move = (e: PointerEvent) => {
    if (this.inert || !this.drag || e.pointerId !== this.drag.pointer) return;
    this.scrubTo(e.clientX);
    e.preventDefault();
  };

  private up = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointer) return;
    try {
      if (this.drag.el.hasPointerCapture?.(e.pointerId)) {
        this.drag.el.releasePointerCapture?.(e.pointerId);
      }
    } catch {
      /* Capture already released by the browser. */
    }
    this.drag = null;
  };

  private scrubTo(x: number) {
    if (!this.drag) return;
    const el = this.drag.el.isConnected
      ? this.drag.el
      : this.root.querySelector(`[data-scrub="${escapeAttr(this.drag.name)}"]`);
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const at = ((x - box.left) / box.width) * 100;
    const opts = options(el);
    if (!opts.length) return;
    const rawEdges = (el.getAttribute("data-edges") ?? "").split(/\s+/).filter(Boolean).map(Number);
    const validEdges = rawEdges.length === opts.length - 1 && rawEdges.every(Number.isFinite);
    const bounds = validEdges ? rawEdges : opts.slice(1).map((_, i) => ((i + 1) * 100) / opts.length);
    let i = 0;
    while (i < bounds.length && at >= bounds[i]) i++;
    if (opts[i] != null) this.pick(this.drag.name, opts[i]);
  }
}

const options = (el: Element) => (el.getAttribute("data-options") ?? "").split(/\s+/).filter(Boolean);

function groupOptions(group: Element): Element[] {
  return Array.from(group.querySelectorAll("[data-option]")).filter((o) => o.closest("[data-choice]") === group);
}

function conditions(spec: string): [string, string[]][] {
  return spec.split(/\s+/).flatMap((c) => {
    const at = c.indexOf("=");
    return at > 0 ? [[c.slice(0, at), c.slice(at + 1).split("|")] as [string, string[]]] : [];
  });
}

function escapeAttr(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}

function set(el: Element, name: string, value: string) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function toggle(el: Element, name: string, on: boolean) {
  if (on !== el.hasAttribute(name)) el.toggleAttribute(name, on);
}
