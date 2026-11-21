# Generative UI

A ` ```ui ` fence in a chat reply holds plain markup — sanitised HTML and inline
SVG styled with a small class vocabulary on the app's semantic tokens — drawn
directly in the reply's own DOM while the reply streams and after it commits.
Unlike ` ```openui ` (confirmable cards, live student data and quizzes) and
` ```widget ` (sandboxed TSX programs in an iframe,
[widgets.md](./widgets.md)), a `ui` block displays an answer inline with no
script, no external styles and no iframe.

## Where

| Piece | Location |
| --- | --- |
| Fence host and frame coalescing | `app/src/components/markdown/genui/GenUIFence.tsx` |
| Streaming prefix repair | `app/src/components/markdown/genui/repair.ts` |
| Inert sanitiser and allow-list | `app/src/components/markdown/genui/sanitize.ts`, `app/src/components/markdown/genui/allow.ts` |
| In-place DOM morph | `app/src/components/markdown/genui/morph.ts` |
| Inline and display `$…$` maths | `app/src/components/markdown/genui/maths.ts` |
| Closing-fence detection and reply index | `app/src/components/markdown/genui/remarkUi.ts` |
| Interactive runtime and control styles | `app/src/components/markdown/genui/runtime.ts`, `app/src/components/markdown/genui/controls.css`, `app/src/stores/chat/widgetStore.ts` |
| Declarative charts (`data-chart`) and height reservation | `app/src/components/markdown/genui/ChartHost.tsx`, `app/src/components/markdown/genui/chartData.ts`, `app/src/components/markdown/genui/charts.css` |
| Shared chart components and streaming context | `app/src/components/markdown/openui/components/charts/` (`Figure.tsx`, `BarChart.tsx`, `LineChart.tsx`, `DonutChart.tsx`, `ScatterChart.tsx`, `OpenUIChart.tsx`) |
| Vocabulary stylesheet | `app/src/components/markdown/genui/genui.css` |
| Agent brief grammar and visual routing | `app/src-tauri/templates/HARNESS.template.md` |
| Markdown routing and folded-reply pointer | `app/src/components/markdown/MdComponents.tsx` (`pre`, `widget-pointer`) |
| Streamed row promotion, folding and find | `app/src/components/harness/timeline/Timeline.tsx`, `app/src/components/harness/timeline/rows.ts`, `app/src/components/harness/timeline/Messages.tsx`, `app/src/components/markdown/openui/remarkWidgets.ts` |

## A `ui` fence draws while it streams and survives commit

`Timeline` (`app/src/components/harness/timeline/Timeline.tsx`) subscribes to
whether the live stream contains an opening `widget` or `ui` fence
(`STREAMED_FENCE`), which flips once per reply. Once matched, the streaming
reply renders as the committed `Reply` row it will become under `replyKey` with
the committed row's `[null, Item]` child shape
([harness.md](./harness.md#the-timeline-never-re-renders-per-token)). When the
reply commits, React keeps the `GenUIFence` instance and its DOM subtree
mounted.

`MD_COMPONENTS.pre` (`app/src/components/markdown/MdComponents.tsx`) routes
`language-ui` fences to `GenUIFence` from the opening line so unfinished markup
never flashes as a code block. `remarkUi` sets `data-fence-closed` by inspecting
the raw fence lines, matching `remarkWidgets`. While the fence is open,
`GenUIFence` coalesces deltas to one `requestAnimationFrame` pass; once
`closed` is true, `useLayoutEffect` cancels any queued frame and flushes
synchronously in the same commit.

Each pass runs three steps in order:

1. **Repair (`repairPrefix`).** While open, strips a half-arrived closing fence
   (trailing backticks or tildes on the last line), an unclosed HTML comment, an
   unclosed `<…` tag, a truncated HTML entity (`&am`, `&#x20`) and an unclosed
   trailing `$…$` / `$$…$$` formula. Open ancestor tags are left for the HTML
   parser to close, so half-built rows (such as a stat tile with only its label)
   appear as they arrive without shifting content above the block.
2. **Sanitise (`sanitize`).** Parses the markup into an inert `<template>` so
   nothing executes or fetches, walks its `DocumentFragment`, renders maths in
   eligible text nodes, and returns the cleaned fragment.
3. **Morph (`morph`).** Reconciles the host's live DOM children against the
   cleaned fragment by index, keeping every node whose `nodeType`, `nodeName`
   and `namespaceURI` match. Existing elements, SVG figures, text nodes and
   unchanged formulas keep their identity across every delta and commit.

Bad markup degrades silently: whatever survives the sanitiser is drawn, with no
failure card. When nothing survives (or only whitespace), `GenUIFence` sets
`data-empty` on the host and `.genui[data-empty]` hides it so the block draws
nothing.

## The sanitiser enforces a closed vocabulary

`allow.ts` defines the exact surface agent markup may reach:

- **Elements.** `HTML_ELEMENTS` admits structural, text, list, table, figure
  and button elements (`button` is forced to `type="button"`). `SVG_ELEMENTS`
  admits inline SVG shapes, text, defs, gradients, markers and clip paths, only
  inside the SVG namespace. `DROP` removes `script`, `style`, `template`,
  `noscript`, `iframe`, `object`, `embed`, `form` and inputs, media elements,
  `link`, `meta`, `base`, `foreignObject`, `use`, SVG animation and filter
  elements, `math`, `dialog` and `portal` together with their subtrees. Any
  other tag (including `<a>`) or misplaced namespace element is unwrapped so
  its text survives without the element.
- **Attributes.** Event handlers (`on*`), `href`, `src` and values containing
  `javascript:`, `vbscript:` or `data:` are stripped. `id` values are prefixed
  with the block's React `useId` prefix and local `url(#id)` references are
  rewritten to match; external `url(…)` references are dropped.
- **Classes and inline styles.** `class` admits only names in `CLASSES` and
  `g-*` vocabulary classes, so agent markup cannot reach Tailwind utilities
  such as `fixed` or `inset-0`. `style` keeps only custom properties
  (`--name`) and a short list of text and SVG paint properties (`STYLE_PROPS`),
  rejecting `url(`, `expression`, `image` and `attr(`.
- **Reserved and runtime-owned attributes.** Attributes for interactive
  behaviours (`data-choice`, `data-value`, `data-option`, `data-show`,
  `data-scrub`, `data-options`, `data-edges`) and chart hosts (`data-chart` and
  its companions) pass through inertly; `morph` skips descending into
  `[data-chart]` children so a host can own them. Runtime-owned attributes
  (`RUNTIME`: `data-on`, `data-off`, `aria-checked`, `aria-valuenow`,
  `aria-valuetext`, `tabindex`, `role`, `hidden`) are stripped from agent
  markup and never overwritten by `morph`.

## Three attributes drive state without agent script

`GenUIFence` attaches one `BlockRuntime` (`app/src/components/markdown/genui/runtime.ts`)
to the block's root element with a single delegated listener set and calls
`apply()` after every `morph` pass. State lives in the runtime's map rather than
the DOM, so later streamed deltas and the reply commit keep active picks and
pointer-captured drags intact.

- **Choice (`data-choice`, `data-value`, `data-option`).** A group carries
  `data-choice="<name>"` (and optional default `data-value`) around
  `data-option="<val>"` items. The runtime marks the group `role="radiogroup"`
  and each option `role="radio"`, `aria-checked`, `data-on` and roving
  `tabindex` (`0` on the active option, `-1` on siblings). Clicks, `Enter`,
  `Space`, arrow keys, `Home` and `End` change the pick; arrow keys move focus
  only when focus is already inside the block so a hidden pane never steals the
  keyboard.
- **Show-when (`data-show`).** `data-show="f=balanced s=2|3"` keeps an element
  visible only while every named choice holds one of the pipe-separated values
  and sets `data-off` (`display: none !important` in `controls.css`) otherwise.
  An unknown choice name or empty condition hides the element silently without
  logging.
- **Discrete scrub (`data-scrub`, `data-options`, `data-edges`).** Maps
  horizontal pointer drags (using pointer capture, never HTML drag and drop)
  and keyboard steps (`ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`, `Home`,
  `End`) across percent breakpoints (`data-edges`, or equal divisions when
  omitted) to the values in `data-options`, writing `role="slider"`,
  `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext`.
  Pointer position is measured as a fraction of the element's box width so page
  zoom does not skew hit regions.

While a fence is still open (`!closed`), `BlockRuntime` sets `inert` on every
choice group, option and scrub, ignores input events and shows the declared
default state (first `data-value`, else first `data-option` or `data-options`
entry). Once the fence closes, `inert` clears and controls go live. Control
styles live in `app/src/components/markdown/genui/controls.css` on semantic
tokens only and disable transitions under `prefers-reduced-motion: reduce`.

Committed picks persist in `app/src/stores/chat/widgetStore.ts` under
`genuiKey(thread, row, blockIndex)` (`${thread}:${row}:ui:${block}`), where
`blockIndex` is assigned in syntax order by `remarkUi` (`data-ui-index`) without
touching `remarkWidgets`'s counter. Changed block source starts fresh via
`entryState`, picks made after a fence closes but before commit flush when
`WidgetRow` arrives, and `widgetStore.prune` clears saved picks on thread delete
and rewind alongside cards and widgets.

## Maths and tables follow the reply's rules

Text nodes outside `<svg>`, `<code>` and `<kbd>` run through `mathify`
(`maths.ts`). `splitMaths` follows `remark-math`'s delimiter rules (`$…$` and
`$$…$$`, skipping `\$`, whitespace-padded dollars and `$` inside TeX braces).
Each formula renders through the app's `renderToString` (`app/src/lib/maths/`),
strict first and lenient on error, wrapped in `<span class="genui-math"
data-tex="…">`. Cached fragments are cloned per formula, and `morph` compares
formulas by `data-tex` and `className` alone so unchanged maths is never walked
again while pending formulas swap in once `useMathsReady` flips true.

Every bare `<table>` is wrapped once in `<div class="g-table">` by `sanitize`,
matching markdown tables in `MdComponents.tsx`. `.genui .g-table` scrolls
horizontally only (`overflow-x: auto; overflow-y: hidden`), so wide tables never
widen the chat column and nothing inside a `ui` block scrolls vertically.

## Charts draw from data attributes with the app's chart components

A `[data-chart]` element inside a `ui` block carries only its numbers; the app
draws it with the same chart components used by ` ```openui ` fences
(`BarChart`, `LineChart`, `DonutChart`, `ScatterChart` in
`app/src/components/markdown/openui/components/charts/`), so hover readouts,
accessible `sr-only` data tables and chart token colours (`chart-1`–`chart-5`
and `chart-other`, in order, never chosen by the agent) match every other chart
in Oculus.

`Figure.tsx` reads streaming state from `ChartStreaming` rather than OpenUI's
hook: OpenUI's `defineComponent` wrappers feed `ChartStreaming` through
`OpenUIChart` (`useIsStreaming`), while `ChartHost` mounts the pure chart
components directly with `ChartStreaming` set to `false` and without importing
`@openuidev/react-lang`. After each `morph` pass, `GenUIFence` portals a
`ChartHost` into every `[data-chart]` host (flushed before paint on streaming
frames via `flushSync`, and synchronously in `useLayoutEffect` once closed).
`sanitize` strips any child nodes inside `[data-chart]` so React owns the host's
subtree, and `charts.css` reserves host height in `rem` on `:empty` and reverts
`genui.css`'s unlayered `svg` and `table` rules inside chart hosts.

| `data-chart` | Data attributes | Optional attributes |
| --- | --- | --- |
| `bar` | `data-labels="A\|B"`, `data-values="1 2"` | `data-title`, `data-y-label`, `data-unit` |
| `line` | `data-series="Name: x,y x,y; Name2: …"` | `data-title`, `data-x-label`, `data-y-label`, `data-area` |
| `donut` | `data-labels="A\|B"`, `data-values="1 2"` | `data-title`, `data-center`, `data-unit` |
| `scatter` | `data-series="Name: x,y x,y; Name2: …"` | `data-title`, `data-x-label`, `data-y-label`, `data-trend` |

`parseChartAttrs` (`chartData.ts`) validates every number strictly (finite
numbers only; at least one positive value and no negatives for `donut`; at least
two points per drawn series for `line`; up to five series and 400 points per
series). Missing or unparseable numbers render the chart's title and a muted
"No data" line instead of a broken plot; unsupported `data-chart` values draw
nothing.

## Vocabulary styling uses semantic tokens only

`genui.css` scopes every rule under `.genui` with `contain: layout` so
positioned elements inside a block cannot escape it. The static vocabulary
covers containers (`.g`, `.g.box`), captions and labels (`.g-cap`, `.g-label`),
flex rows (`.g-row`), stat tiles (`.g-stat`), bit result cards (`.g-out`,
`.g-out.alt`, `.bits`), inline SVG and circuit styles (`.cir`, `.w`, `.gate`,
`.orc`, `.mes`, `.mes-i`, `.st`, `.ph`), amplitude bars (`.amps`, `.amp`,
`.trk`, `.pos`, `.neg`, `.read`), tables (`.g-table`, `table`, `th`, `td`),
inline code (`code`, `kbd`) and semantic text tones (`.muted`, `.brand`,
`.success`, `.warn`, `.c1`–`.c5`). All colours come from `colors.css` /
`dark.css` tokens, layouts stay fluid under page zoom without measuring pixel
rects, and `--font-mono` applies only to `code` and `kbd`
([ui.md](./ui.md#one-colour-two-fonts-and-a-floating-card)).

## A derivation lines steps up on the equals sign

`app/src/components/markdown/genui/derive.css` styles multi-step derivations as
a `.g.g-derive` block of `.r` rows, each holding four inline cells: the step
number (`.n`, `tabular-nums`), the left-hand side (`.l`, right-aligned and
non-wrapping), the right-hand side starting with `$= …$` and the short reason
(`.why`). Wide blocks lay rows out as a `border-collapse: collapse` table so
every equals sign aligns on one vertical axis and row separators
(`--color-border-subtle`) meet edge to edge. `.genui` establishes an inline-size
container (`container: genui / inline-size`); below `28rem`, `@container genui`
switches `.g-derive` to a three-column CSS grid with `subgrid` rows so the
reason drops onto a second line beneath its equation while step numbers and
equals signs stay aligned and wide right-hand sides scroll horizontally without
widening the pane or scrolling vertically.

Changed terms are tinted with markup rather than TeX colour commands: the
formula splits around `<span class="hl">$…$</span>` with `{}` on each side of
the cut (`$… -{}$<span class="hl">$\bar y$</span>${} - …$`, or `$= {}$` before
a tinted right-hand side) so the maths engine keeps binary and relation
spacing. `.hl` paints `--color-brand-muted`, keeping foreground text readable in
light, dark and derived themes (whereas `\colorbox` and `\textcolor` bake
literal colours and `\htmlClass` / `\htmlStyle` are refused). The final boxed
result leaves `.l` empty and wraps the whole result in `<span class="fin">`
(styled with `--color-brand` rather than `\boxed`, which draws in the text
colour). Empty `.hl` and `.fin` spans hide via `:empty` while `repairPrefix`
holds back an unclosed `$…$` formula during streaming.

## Folded replies, copy and find treat `ui` like `widget`

- **Folded replies.** `mayHoldWidget` and `remarkFenceSplit`
  (`app/src/components/markdown/openui/remarkWidgets.ts`) include `ui` without
  adding it to `remarkWidgets`'s `openui`/`widget` index counter. A folded
  earlier reply carrying a `ui` fence gets an `ArtifactRow` below its run's
  fold while the prose inside the fold renders a `widget-pointer` reading
  "Visual shown below". In runless stretches `isCommentary` (`rows.ts`) keeps a
  `ui`-carrying reply visible.
- **Copy as markdown.** `GenUIFence` sets `data-md` to the original
  ` ```ui … ``` ` fence, so selecting across a block copies or drags out its
  markdown source via `selectionMarkdown` (`app/src/lib/markdown/selection.ts`),
  while selecting inside the block copies the selected text or table.
- **Find in chat.** `foldFindText` (`rows.ts`) strips `ui` fences alongside
  `openui` and `widget` so collapsed work folds do not open for text already
  visible in `ArtifactRow`; live DOM find (`useDomFind`) searches text inside
  rendered `.genui` blocks directly.

## The agent brief teaches the grammar directly

The ` ```ui ` fence grammar and visual routing live in
`app/src-tauri/templates/HARNESS.template.md` rather than a skill, so every
provider sees the exact closed vocabulary, three behaviours, chart attributes,
derivation markup and two short examples without opening a skill first
([harness.md](./harness.md#the-brief-is-appended-except-on-opencode)).

"Showing a picture or a page" makes prose the default and routes shapes,
comparisons, charts, discrete step-through states and derivations to ` ```ui `,
3D, simulations and typed-input programs to ` ```widget `, and formula sliders,
quizzes, flashcards, live student data and proposals to ` ```openui `. A reply
never opens with a block, places each block right after the sentence it
illustrates and follows it with a sentence that reads it, uses one `.g-derive`
block alone for a derivation, adds interactivity only when there is something
worth changing, and writes blocks after the last tool call so providers whose
pre-tool text is summarised do not drop them.

## Gotchas

- Never widen `allowedClass` beyond the vocabulary — allowing Tailwind utilities lets markup cover the app (`fixed inset-0`).
- Never parse agent markup with `innerHTML` on a live element; `<template>` keeps parsing inert so images and event handlers never fire.
- Never drop `contain: layout` from `.genui` or add vertical overflow inside a block; only `.g-table` and display maths scroll horizontally.
- Never put literal colours in `genui.css` — every rule must use semantic tokens so light, dark and custom themes stay readable.
- Keep `RUNTIME` attributes stripped in `allow.ts` and skipped during `syncAttrs` in `morph.ts`, or streamed updates will wipe interactive state.
- Keep `ui` out of `remarkWidgets`'s `NUMBERED` counter so a reply mixing `ui` with `openui` or `widget` fences keeps stable `widgetKey` indices.
