# Viewers: markdown, PDFs, code, lectures and web pages

How a pane shows content: library markdown (with maths, diagrams and a
lightbox), PDFs and source files, an Ed lesson's slides, a lecture or a
library video in the media player, a video's transcript, and a web page.

## Where

| Piece | Location |
| --- | --- |
| Markdown, maths, mermaid, lightbox, PDF | `app/src/components/markdown/`, `app/src/components/ui/lightbox/Lightbox.tsx`, `app/src/components/files/pdf/`, `app/src/lib/pdf/pdfView.ts`, `app/src/lib/pdf/pdfFind.ts` |
| Inline file, web and planning references; hover metadata | `app/src/components/markdown/FileChip.tsx`, `app/src/components/markdown/ReferenceLink.tsx`, `app/src/components/markdown/ReferencePreview.tsx`, `app/src/components/markdown/referenceDetails.ts`, `app/src/lib/files/referenceAppearance.ts` |
| The maths engine: loading, rendering, `rehypeMaths`, the visual field's edit model (`field.ts`) and the geometry of source-mapped maths (`geometry/`: where each caret stop is drawn, which stop a press lands on, a selection's bands); KaTeX's CSS and fonts | `app/src/lib/maths/`, `app/src/styles/katex/` |
| Whiteboard and notebook files | `app/src/components/whiteboard/`, `app/src/lib/whiteboard/`; [drawing-whiteboard.md](./drawing-whiteboard.md) |
| A parsed PDF's faces: PDF, Markdown | `app/src/components/files/FileViewer.tsx`, `app/src/components/files/FileMarkdown.tsx`, `app/src/components/files/pdf/pdfMdLink.ts`, `app/src/lib/pdf/pdfBlocks.ts` |
| An Ed lesson's view: the slide sidebar and pane, a challenge slide's Description \| Workspace strip and read-only workspace, the index reader, statuses Ed answered this session | `app/src/components/lessons/`, `app/src/hooks/data/useLessonIndex.ts`, `app/src/lib/ed/lessons.ts`, `app/src/lib/ed/slideStatus.ts`, `app/src/lib/ed/views.ts`, `app/src/lib/ed/workspace.ts` |
| The code editor and a library source file's read-only view | `app/src/components/code/`, `app/src/components/files/CodeFileViewer.tsx`, `fileLanguage` in `app/src/components/documents/editor/syntax/codeLanguages.ts`, `CODE_EXTS` in `app/src/lib/files/fileTypes.ts` |
| Media player: clock, controls, keys, fullscreen, captions, dock frame, cue list | `app/src/components/media/`, `app/src/lib/lectures/media/`, `app/src/stores/lectures/playerPrefsStore.ts`, `app/src/hooks/lectures/useTranscriptDock.ts` |
| Lecture player: two sources, playback owner, chapters, chat | `app/src/components/lectures/`, `app/src/lib/lectures/playback/`, `app/src/lib/lectures/playbackOwner.ts` |
| Done and Up Next: the lecture's end, the card, its thumbnail | `app/src/lib/lectures/end.ts`, `app/src/components/lectures/UpNext.tsx`, `lecture_thumbnail` in `app/src-tauri/src/lectures/chapters/app.rs` |
| Library videos | `app/src/components/files/VideoFileViewer.tsx`, `app/src/lib/files/openFile.ts` |
| A page's video cards: Echo360, Canvas, YouTube/Vimeo; their shared frame, the subject, the stores | `app/src/components/markdown/embed/EmbedVideoCard.tsx`, `app/src/components/markdown/embed/CanvasVideoCard.tsx`, `app/src/components/markdown/embed/WebVideoCard.tsx`, `app/src/components/markdown/embed/card/`, `app/src/components/markdown/embed/EmbedSubject.tsx`, `app/src/stores/lectures/embedDownloadStore.ts`, `app/src/stores/lectures/videoDownloadStore.ts`, `app/src/stores/lectures/webVideoStore.ts` |
| YouTube and Vimeo metadata (`web_video_info`) | `app/src-tauri/src/sources/oembed.rs` |
| Transcribe from a player | `app/src/hooks/lectures/useTranscription.ts`, `app/src/components/media/TranscribeEmpty.tsx` |
| Transcript search and source-index mapping | `app/src/hooks/lectures/useTranscriptSearch.ts` |
| Microphone clip transcription | `app/src-tauri/src/transcribe/dictation.rs` |
| Groq's allowance as its answers report it (`groq_usage`) | `app/src-tauri/src/transcribe/groq_usage.rs`, `app/src/lib/dictation/groqUsage.ts`, `app/src/components/harness/dictation/GroqUsageToast.tsx` |
| Dictation cleanup: Groq's Qwen, S1-mini, the `llama-server` sidecar, the commands | `app/src-tauri/src/transcribe/cleanup/`, `app/scripts/build-llama.mjs`, `app/src/lib/dictation/cleanup.ts` |
| Transcription of videos without captions | `app/src-tauri/src/transcribe/`, `app/src-tauri/src/providers/groq.rs`, `app/src/lib/lectures/transcribe/` |
| Settings → Transcription: the language, the engine list, each engine's dialog and dictation cleanup | `app/src/components/settings/transcription/TranscriptionSection.tsx`, `app/src/components/settings/transcription/GroqDialog.tsx`, `app/src/components/settings/transcription/OnDeviceSpeech.tsx`, `app/src/components/settings/transcription/LocalWhisper.tsx`, `app/src/components/settings/transcription/DictationCleanup.tsx`, `app/src/components/settings/transcription/GroqCard.tsx` |
| The on-device speech helper | `app/src-tauri/speech/main.swift`, `app/scripts/build-speech.mjs`, `app/src-tauri/src/transcribe/engines/apple.rs` |
| Local Whisper: the engine, its model files | `app/src-tauri/src/transcribe/engines/whisper.rs`, `app/src-tauri/src/transcribe/engines/whisper_models/`, `app/scripts/build-whisper.mjs` |
| Native light/dark preference for browser pages | `app/src-tauri/src/shell/native_layer/page_theme.rs`, `app/src/lib/ui/themes/apply.ts` |
| In-app browser, downloads and their Save dialog | `app/src/pages/tools/BrowserPage.tsx`, `app/src/hooks/shell/useBrowserTabs.ts`, `app/src/lib/browser/history/`, `app/src-tauri/src/shell/browser/`, `app/src-tauri/src/shell/browser/downloads/`, `app/src/lib/browser/downloads/`, `app/src/hooks/shell/useBrowserDownloads.ts`, `app/src/stores/shell/browserDownloadsStore.ts`, `app/src/stores/shell/browserPrefsStore.ts`, `app/src/pages/tools/browser/downloads/` |

## One markdown renderer serves every surface

`app/src/lib/markdown/math.ts` owns delimiter detection and source normalization.
Library file rendering always runs `rehypeMaths` so math fences and HTML math
classes work even when there are no dollar delimiters.

- **`MD_COMPONENTS`** (`app/src/components/markdown/MdComponents.tsx`) is
  the component map for every surface. A library file — a Canvas page,
  announcement or assignment, a parsed PDF, an Ed thread — renders through
  `FileMarkdown` with it, extended by `FileViewer`'s
  `useLibraryMdComponents` to resolve in-file links, and without the front
  matter a scraped thread or lesson carries (`stripFrontmatter`); chat replies through
  `CompactMd`, with `rehypeMaths` only when `hasMath` finds a delimiter.
  `normalizeMath` (`app/src/lib/markdown/math.ts`) rewrites the source so
  remark-math reads the maths as written: `\(…\)` / `\[…\]` become dollars
  (CommonMark eats the backslash first); a `$$` sharing its line with TeX
  (`$$\begin{aligned}`, `\end{aligned}$$ Then…`) gets its own line, since
  remark-math drops the opener's text and never closes on the other; a price
  (`$5 and $10`, `$5-$10`) is escaped; `\$` inside `$…$` becomes `{\char36}`,
  which `rehypeMaths` turns back (`restoreDollars`), because remark-math closes a
  formula on any `$`; and a `|` in a formula in a table row becomes `\vert`,
  since GFM splits the row first. The dollar rules are `scanMaths`
  (`app/src/lib/markdown/mathScan.ts`), which `ui` blocks share.
  `bun scripts/maths-lint.ts` (from `app/`) replays every reply in `oculus.db`
  through this pipeline and KaTeX and lists the formulas that fail and the TeX
  left as prose; each rule above came from a run of it. An inline `<code>` holding only a citation (`app/src/lib/citations/`)
  renders as `FileChip`. `![alt](path)` naming a library picture or HTML
  page renders it in place (`OutputEmbed.tsx`); in a chat, a picture from the
  agent's workspace keeps a 28px line under it for its alt and Save to Drive…,
  and a page has the action in its header. In replies, `outputs/x.svg`
  and `./outputs/x.svg` both name a file under the agent’s `outputs/` folder.
  A query such as `?v=2` stays on the image URL, outside the encoded disk
  path. PDF page and lecture time fragments locate the cited passage; any other `#` or `?` is part of the file name.
- **A fenced code block is syntax-coloured** by `HighlightedCode`
  (`app/src/components/markdown/HighlightedCode.tsx`) with the note editor's
  grammars and palette (`codeLanguage`, `codeStyle`). The fence's tag picks the
  grammar and an untagged fence is guessed; a block stays plain until its
  grammar's import lands, when it has no grammar, and above 30 000 characters.
- **Inline references share a glyph and a hover card.** `FileChip` preserves
  citation paths for copying and the composer's atomic mentions; clickable
  references use an understated underline and content-specific Phosphor colours
  (`reference-*` tokens). Inline glyphs, favicons, spacing and baseline offsets
  use `em` units so references scale with headings; hover-card icons keep their
  own fixed size. In prose they have link semantics so they select with
  the sentence; only composer mentions are non-editable, and a selection drag
  never opens the reference. `ReferenceLink` handles web URLs and recognised task,
  project and lecture routes. Web links reuse the browser's cached favicon,
  falling back to a globe when absent or unreadable. Preview metadata loads
  only while the portaled card is open; a failed lookup leaves the path and
  type visible. Library-relative links use the same file reference after
  `libraryLinkTarget` resolves them, retaining their caller's opener.
- **A library file's raw HTML is sanitized** (`fileMarkdownPlugins` in
  `FileMarkdown.tsx`). When the text holds a `<`, `rehype-raw` parses its HTML
  and `rehype-sanitize` cleans the tree straight after, before
  `rehypeMaths` and the block anchors, so their own output (KaTeX markup,
  `data-page`) is never checked. The schema
  (`app/src/lib/markdown/sanitizeSchema.ts`) is GitHub's default plus
  `<echo-video link-id src title>`, `<canvas-video file-id title>`,
  `<web-video provider video-id hash title>` and remark-math's classes. Grow it from a tag
  scan of the library's `.md`, not from memory; across the library it drops
  only prose that parses as a tag
  (`<section1>`, `<the>`, kept as their text), `on*` handlers, comments and
  stray `<title>`/`<meta>`/`<form>`. MinerU's `<sub>`/`<sup>` render
  unchanged. Its `user-content-` id prefix stays: nothing in the app
  navigates by id, and it keeps a page's ids off `window`.
- **Canvas's `<details>` and video tags render as components** in
  `MD_COMPONENTS`: `details`/`summary` as a bordered dropdown whose caret
  turns by its own element's `[open]` (`group-open` would turn nested ones
  too), and the three video tags as cards. hast keeps the attribute names,
  so the props are `link-id`, `file-id`, `video-id`. The tags are written by
  the sync ([sync.md](./sync.md#canvas-html-becomes-markdown-with-a-few-kept-tags)).
- **A task list (`- [ ]`) keeps its indent and drops its bullets.** The
  `ul`/`ol`/`li` renderers merge remark-gfm's `contains-task-list` and
  `task-list-item` classes into their own rather than spreading over them;
  the disabled box hangs back into the list's indent (`input`), so wrapped
  lines align with the text, and sits on the first line.
- **Every video card shares one frame** (`app/src/components/markdown/embed/card/`):
  a 16:9 thumbnail (a camera glyph without a picture), the name and a meta
  line, the actions — one height in every state, the skeleton included. It is
  spans, since a tag can land in a paragraph or table cell, and carries the
  tag as `data-md` so a copied selection keeps it. Echo360 and Canvas cards
  need the subject, which `MD_COMPONENTS` doesn't have, so `FileViewer` (every
  library file) wraps the markdown in
  `EmbedSubjectProvider`, which looks the code up in the subjects list by id
  (a course folder is `safe_dir(code)`, not the code). For a subject absent from
  the list, it is `VideoLinkOut`, a button named by the tag’s
  title that opens Canvas. Chat replies don't parse raw HTML, so a tag in one
  shows as its literal text.
- **`<echo-video>` is an Echo360 video**
  (`app/src/components/markdown/embed/EmbedVideoCard.tsx`). The tag's
  `title` (the Canvas iframe's) names the card until the info call answers,
  and stands in when Echo360's name is empty. Its states:
  - **resolving** — the skeleton, with the title when the tag has one;
  - **ready** — the poster from `posterRel`, Echo360's media name without its
    video extension, the length (`fmtDurationSecs`, as lecture rows show it)
    and a captions mark, then **Play** once `fileRel` is set (the file's row
    through `openFileSmart`, so the shared media player and its Transcript tab;
    ⌘-click opens a tab) or **Download**;
  - **downloading** — the percent, a spinner before the first byte,
    "Joining…" while ffmpeg muxes, and Cancel; it turns to Play once the
    file's row has landed;
  - **download off** (`restrictDownload`) — says so, with Open in Canvas;
  - **failed** (the info call or a download) — the message verbatim and Retry.
    A cancel goes back to Download silently.

  Every state but download-off keeps a small Open in Canvas icon (⌘-click for
  a new tab). The info call launches the link in Echo360, which
  records a view, so `embedDownloadStore` asks it once per link per app
  session and forgets only a rejection. Play that finds no row asks again;
  the backend clears a deleted file, so the card offers Download.
- **`<canvas-video>` is a video file uploaded to Canvas**
  (`app/src/components/markdown/embed/CanvasVideoCard.tsx`), named by its
  `title` without the extension, on a camera tile (Canvas gives no poster). A
  sync never fetches one — they run to hundreds of megabytes — so the card
  looks for a `files` row with this subject and `canvas_id = file-id`
  (`getFileByCanvasId`, again on every `FILE_SCRAPED_EVENT` for that file):
  found, it shows the size and **Play** (`openFileSmart`, ⌘-click a tab);
  otherwise **Download**, through `videoDownloadStore` and
  `canvas_download_video` exactly as a module video
  ([frontend.md](./frontend.md#uploads-and-documents-are-ordinary-library-files)),
  then the percent and Cancel, then Play once the row lands. A failure shows
  verbatim with Retry. Every state keeps the Open in Canvas icon, to
  `/courses/<subject id>/files/<id>` on the profile's Canvas, read at the
  click (a subject's id is its Canvas course id;
  `app/src/lib/files/canvasLinks.ts`).
- **`<web-video>` is a YouTube or Vimeo video**
  (`app/src/components/markdown/embed/WebVideoCard.tsx`), Play only. Its
  thumbnail, title, channel and (Vimeo only) length come from the provider's
  oEmbed endpoint through `web_video_info` (`app/src-tauri/src/sources/oembed.rs`,
  in Rust because the webview's CORS refuses it), which checks the provider
  and the id's charset before building a URL. `webVideoStore` asks once per
  video per app session and forgets a rejection. Until then, or without an
  answer, the card shows the tag's title (else "YouTube video"/"Vimeo video")
  and still plays. Play opens `youtube.com/watch?v=<id>` or
  `vimeo.com/<id>/<hash>` through `openLink`, so an in-app page beside it (⌘-click
  for a tab of its own); never an iframe in the app's webview, since
  YouTube refuses embeds from the app's origin. An unknown provider renders
  nothing.
- **A reply goes through `CompactMd`**, whose `.md-compact` rules in `index.css`
  are deliberately *unlayered* — in `@layer base` they would lose to the
  utilities they override. **`InlineMd` flattens blocks** because chapter
  summaries sit inside buttons, and a `<p>` in a `<button>` closes it early.
- **Maths is drawn by the maths engine**, a WebAssembly build of a Rust port
  of KaTeX 0.18.5 (`app/math-core/`; [development.md](./development.md#the-maths-wasm-is-built-not-committed))
  behind KaTeX's `renderToString` in `app/src/lib/maths/`, so the markup and
  every class our code reads (`.katex`, `.katex-display`, the MathML's TeX
  annotation that copy reads) are KaTeX's. `main.tsx` starts loading it at
  boot without waiting. Until it is ready `rehypeMaths` writes a formula's
  source as a placeholder (`.md-math-pending`), and each component that
  renders markdown calls `useMathsReady` to redraw then; a `memo` one
  (`Body` in `FileMarkdown.tsx`) must call it itself. Renders are cached
  in two layers: `renderToString` (`render.ts`) keeps the HTML or the
  `ParseError` by source and every option that changes output (macros
  included), up to 2000 entries and 4M characters; above it `rehypeMaths`
  keeps the last 2000 formulas' trees by display mode and source, hands out
  a copy of each and reports a cached error to the file each time, so
  reopening a maths-heavy chat neither typesets nor reparses it. A formula that traps
  the engine (a few hundred levels of nesting) is a render error, and a spare
  instance takes over (`engine.ts`). KaTeX's CSS and fonts are vendored in
  `app/src/styles/katex/`, imported unlayered.
- **A spreadsheet opens as its text** (`marks.xlsx.md`, a table per sheet),
  in-app like a PDF rather than in the system viewer (`lib/files/openFile.ts`), with no
  PDF ↔ Markdown toggle.
- **A source file opens read-only in `CodeEditor`** (`CodeFileViewer`), not
  as markdown: any extension in `CODE_EXTS`, each held by a test to a grammar
  `fileLanguage` knows. See [the code editor](#one-code-editor-for-source-files).
- **A file with a web `source_url` has an Open in Canvas / Open in Ed button**
  (`OpenOriginal` in `FilePage`'s header, ⌘-click for a new tab). A synced
  Canvas page or Ed thread is our markdown of it; the button opens the
  original, with its embeds and styling, beside it through `openLink`. Ed
  thread and slide files also carry an `[Open in Ed]` line in their text.
- **`FileViewer` resolves in-file links locally** — `../` links, links into a
  folder beside the file (an Ed lesson's `<id>-<slug>/…` assets) and Canvas
  `/files/<id>` or `/pages/<slug>` URLs, by `canvas_id`, path or `source_url`
  (`app/src/lib/files/libraryLinks.ts`, shared with the note editor). A selection
  in its rendered markdown copies or drags out as markdown, maths as TeX
  (`app/src/lib/markdown/selection.ts`, shared with the chat timeline).
  Rendered maths is one unit to a selection from the prose around it, as in
  the note editor: an end inside a formula copies the whole formula (inline
  as `$…$`, display as `$$` lines, `formulaMarkdown`), and
  `watchMathSelection` (`mathSelection/whole.ts`) paints bands over all its
  atoms, as a press-and-drag over all of it would, instead of KaTeX's
  per-glyph highlight; the display wrapper also suppresses native selection
  paint so WebKit leaves no full-width stripes. Selected text and inline maths
  in paragraphs, headings, list items and table cells share one highlight
  height per visual baseline (`mathSelection/lines.ts`,
  `lib/maths/geometry/lineBands.ts`), shared with the note editor: the taller ink sets the
  band’s height, so small maths fills the text height and a tall fraction
  gives the adjacent text the same height. An inline matrix stays whole with
  its brackets and cells, giving the surrounding prose its full height too.
  Each top-level base’s strut sets its baseline, independent of cell and
  delimiter fonts, with a small tolerance for WebKit’s text metric rounding.
  The native range and clipboard stay unchanged. Direct selections inside maths
  and display formulas keep structural bands;
  nothing boxes a whole display formula. A press on a formula
  selects by structure — a cell, a matrix, a run of atoms — and copies that
  part's LaTeX wrapped by its shape (`copied` in `mathSelection/clipboard.ts`,
  shared with the note's field): within one line as `$…$`, over more than
  one line (two of a display's rows, or an array whose rows it holds, which
  the model takes whole with its environment) or a whole display formula as
  `$$` lines, one row each, also as `BLOCK_MATH_TYPE`; the bare TeX goes as
  `application/x-latex`. A press outside it, Esc or focus moving ends it. It selects in place
  (`app/src/lib/markdown/mathSelection/`): a double-click selects the atom under
  the pointer; a triple-click selects its nearest enclosing structure (a
  fraction, radical or scripted base), or its row when there is none.
  `unitAt` in `lib/maths/geometry/units.ts` maps the glyphs to the model’s stops;
  multi-click dragging extends by whole units. A triple-click on prose takes
  the full DOM paragraph (`mathSelection/paragraph.ts`), including every inline
  formula and the text after it. `rehypeMaths` renders every
  formula with the source map, and the press runs the note field's edit model
  (`MathField`) read-only over the drawing: the geometry finds the stop under
  the pointer, a drag selects to it (the model widening over whole
  structures), and bands are drawn under the glyphs in a zero-size layer
  inside `.katex`, so no glyph moves. A band covers the selected atoms of
  one line (`bands` in `lib/maths/geometry`): a display's row, or a row of
  an array whose rows are all selected, its delimiter and the atoms beside
  it banded apart, so a whole `cases` reads as its rows, not one box. Padding
  checks every pair of bands that shares horizontal space so the tint does not
  double between rows. Bands and pointer geometry track the containing
  block and KaTeX’s inline blocks for wrapping and font changes
  (`mathSelection/resize.ts`); non-replaced inline spans do not send resize
  notifications. A band reaches past the formula's box, so closing clears the bands first and drops the layer two
  frames later: gone in the same paint as `.katex`'s stacking, WebKit
  repaints only that box and leaves the bands' edges on screen. The press's `mousedown` is
  cancelled (no text selection, focus is blurred), never its `pointerdown`. A single
  press with no drag selects nothing; ⌘A widens in the formula
  (`lib/menu/editRouting.ts`); copy is taken in the capture phase, after
  cancelling `beforecopy` so WebKit enables Copy. The source map's offsets
  index the TeX annotation's text, which is why `rehypeMaths` makes line ends
  `\n` first. Maths the model cannot open selects as text does, whole.
- **A ```mermaid fence is caught at `pre`** (`Mermaid.tsx`), and the original
  `<pre>` shows until it renders or if it never parses. Config and drawing are
  `mermaidRender.ts`:
  - `htmlLabels: false` must sit at the config's **top level** (mermaid 12
    ignores it under `flowchart`); HTML labels wrap by an exact float compare
    that page zoom breaks, clipping every long label.
  - `layout: "dagre"` must ship with the spacing keys (`FLOWCHART_LAYOUT`), or
    `rankSpacing`/`nodeSpacing` are discarded.
  - The label is bounded, not the box: `--diagram-min`/`--diagram-max` keep
    labels at or above `MIN_LABEL_PX`, walking tall diagrams toward
    `TARGET_HEIGHT_PX`; below the floor it scrolls rather than shrinks.
  - Colours come from `--diagram-*` in `index.css`, which exist because
    Tailwind v4 emits a theme variable only if something references it.
  - The lightbox copy gets rewritten ids (`rescope`), since mermaid scopes styles
    and arrowheads by id.
- **`Lightbox.tsx` pans with its container's scroll and zooms with a
  `transform`**; every input moves a target the painted scale eases toward, so
  bursts compose. Its toolbar may lead with one action for what it shows
  (`actions`, `LightboxToolbar`'s `lead`, drawn with its divider only once it
  renders a button): a chat picture's Save to Drive…
  ([harness.md](./harness.md#saving-a-chat-output-to-drive)).
- **A picture opens on its file page as an `<img>`**: a synced image, and a
  picture of the student's own (`isPictureFile`: PNG, JPEG, GIF, WebP, AVIF,
  SVG), so a chat picture saved to Drive opens beside the page like a PDF
  rather than in the system viewer (`openFileSmart`). An SVG is active
  content: it is only ever an `<img>`, never inlined. An HTML page of the
  student's still opens in the system browser, as a reply's page does from
  its Open externally; in the app it runs only in a reply's sandboxed frame.
- **`PDFViewer` is ours, over Rust's `pdf_*` commands**
  (`app/src/components/files/pdf/`, invoke wrappers and caches in
  `app/src/lib/pdf/pdfView.ts`). It opens a file by its library-relative path;
  `pdf_open` gives the page sizes, `pdf_render` an RGBA raster at the device
  size the viewer asks for, `pdf_text` a page's lines with per-character
  stops, `pdf_links` its links — all in points of the rendered page. A
  document is shared by every viewer holding it and closed shortly after the
  last one lets go; a password-protected one says so in the viewer body.
  - **Layout is arithmetic, not measurement** (`layout.ts`): continuous
    scroll, single page, or a spread pairing 1|2, 3|4, chosen in the toolbar
    and remembered. Scroll offsets, the page range, the fit and the zoom
    anchor all come from the page sizes, since page zoom scales
    `getBoundingClientRect` ([ui.md](./ui.md#gotchas)).
  - **Zoom** is absolute (100% is printed size), 10%–1000%, by toolbar,
    ⌘-wheel or pinch about the pointer; a pinch arrives as both `ctrlKey`
    wheel and `gesture*` events, and only the gesture zooms. Until the reader
    zooms, the size fits the view and follows its resizes: a portrait page
    fills the width, a wider one fits whole, capped at 125%. The old rasters
    stretch at once and pages redraw 400 ms after the last change.
  - **Only pages near the view are drawn**: within a view's height of it,
    each gets a raster at its CSS size × `devicePixelRatio`, a text layer and
    links; the rest are empty boxes. The raster is capped at Rust's 16M-pixel
    limit and CSS-scaled past it, since one layered page that size can take
    ~1 GB to render. A
    render for a size since replaced is dropped, and queued renders run
    newest first.
  - **The text layer is one transparent span per line**, `<br>` between
    lines, so its text nodes read the page in order (`textLayer.ts`). Each
    span is placed in points × `--pdf-unit`, so a zoom never rebuilds it or
    drops a selection, and stretched to its box with `scaleX` from a canvas
    `measureText`. While a drag selects, an empty block under the spans
    keeps a pointer between lines from jumping the selection to the page's
    end. `index.css` recolours `::selection` to the accent.
  - **A selection copies as the parse's markdown** when the file has one
    (`app/src/lib/pdf/pdfSelectionMarkdown/`). Text layer and `.pages.json`
    meet in `normalizeText` form and are aligned patience-diff style; the
    selection's ends land in the pages joined as one document, because
    MinerU files a paragraph that runs onto the next page under the page it
    starts on. The slice grows to keep maths, figures, links, code and HTML
    tables whole (tables come out as pipe tables through `selectionMarkdown`'s
    walkers), figure links match the Markdown view's copy, and an end on an
    unparsed or unalignable page copies that page's text. It is bound in the
    **capture** phase on the scroller.
  - **A citation** jumps to its page. When the record has blocks, the cited
    lines' blocks (`citedPage` maps the line range into the page's markdown
    and onto the block spans) are boxed and the first is brought into view;
    otherwise the quote's spans are marked (`citation-hit`) each time that
    page's text layer is built. A citation jumps once: coming back from the
    Markdown face keeps the reader's place and the marks.
  - **Find is the viewer's own behind `ui/search/FindBar.tsx`** (`usePdfFind.ts`,
    `app/src/lib/pdf/pdfFind.ts`): opening it reads every page's text once, and a
    query matches case- and diacritic-blind over each page's lines joined by
    spaces, so a match runs across a line break. Every match is painted
    under the text layer, the current one stronger; a new query starts at the
    page in view. Each viewer is a find target, and which one ⌘F reaches is
    [find routing](./shell.md#f-reaches-one-registered-find).
  - **Links** are anchors over the page: a web link opens in-app like any
    other `<a href>`, an internal one scrolls to its page.
  - **The page box names the pages on screen** (`shownPages`: a spread, or in
    continuous scroll every page filling a fifth of the viewport or showing
    half of itself) beside a fixed "/ total". Focused, it holds only the first
    page: digits only, Enter jumps, a range is never typed.
  - **Rust's half is `app/src-tauri/src/library/pdf_view/`, on the pure-Rust
    renderer hayro**, opened and rendered through
    `app/src-tauri/src/library/pdf_render/`, which the embedder shares. A path
    must sit under `courses/` or the workspace, `.oculus/agents/`, in the data
    directory (`agents::readable`).
    The four most recent documents stay open, keyed by path and modification
    time. Renders and text extraction share half the cores, each on its own
    big-stack thread so a deeply nested page cannot overflow a stack and abort
    the app; a render also reserves from the process-wide render budget, ahead
    of the embedder's
    ([retrieval.md](./retrieval.md#rendering-has-two-guards-that-look-removable)).
    Each hayro call runs under `catch_unwind`, so a
    PDF that crashes hayro fails only that call. A raster is exactly the size
    asked for, opaque on white. Lines come in reading order from PdfCraft's
    layout: baseline segments, blocks, columns left to right, inferred word
    spaces. Links resolve URIs and in-document destinations, named ones
    included. Errors are codes: `not-found`, `encrypted`, `invalid`,
    `outside-library`, `page-out-of-range`, `invalid-size`, `too-large`,
    `render-failed`.

- **A parsed PDF has two faces, PDF | Markdown** (`PdfMdToggle` in the file
  page's header, state in `usePdfMd`). One shows at a time. A citation with
  a page turns Markdown to PDF.
  - **The Markdown face renders the `.pages.json` record**, not the `.md`
    (`buildBlockDoc` in `app/src/lib/pdf/pdfBlocks.ts`; [parsing.md](./parsing.md)
    has the record): pages joined by "\n\n" as the `.md` is, each cut at its
    blocks' spans with text outside every block kept as its page's own,
    `normalizeMath` per chunk. It is one `ReactMarkdown`, whose output
    matches the `.md`'s apart from the anchors. Two rehype passes
    (`blockAnchorPlugins`) give each top-level element, and each item of a
    top-level list, `data-page` and `data-block` from the chunk its source
    starts in; the second runs after `rehypeMaths`, which replaces a display
    formula's node with one that has no source position. Without a record
    it renders the flat `.md`; a record without blocks anchors pages only.
  - **The faces share one reading position** (`PdfMdLink`, fresh per file):
    each reports the block at its top a moment after scrolling stops and
    once more on unmount, and the face toggled to puts it back near its top. The PDF reads it by layout
    arithmetic over the page sizes and the boxes, the Markdown by offsets,
    never `getBoundingClientRect`. A record without blocks syncs by page. A
    citation not yet shown wins over the stored position. The Markdown face
    holds a restored block in place while images load or its width changes,
    until the reader scrolls.
  - **Boxes are drawn only for cited blocks**, in a layer of `PdfPage`
    under the text spans like find's, from the `bbox` fractions times the
    page size in points. A record without blocks boxes nothing; its
    citations mark spans.

Chat's composer (`harness/mentions/MentionInput.tsx` sends chips as backticked library paths),
picker and timeline are [harness.md](./harness.md).

## An Ed lesson opens as its slides

A lesson's index, `Course/Lessons/<id>-<slug>.md`, carries the lesson and an ordered
`slides` list in its front matter ([sync.md](./sync.md)); `parseLessonIndex`
(`app/src/lib/ed/lessons.ts`) reads it. When the file page opens an index
whose list has slides (`useLessonIndex`), its body is `LessonView`
(`app/src/components/lessons/`) instead of `FileViewer`, as in Ed:

- **The sidebar** (`LessonSidebar`, 240px) holds the fold toggle
  (`SideNavCollapseToggle`), the lesson's title, its due date and how many
  slides are completed, then a row per slide (`SlideRow`): a glyph for Ed's
  slide type (`slideIcon`), the title, a green tick once completed. A slide
  not yet opened in Ed reads a shade darker; the selected row takes the nav
  column's active fill. ↑/↓ step through the slides. Open in Ed
  (`OpenOriginal`, ⌘-click for a new tab) opens the shown slide's page in
  Ed, else the lesson's.
- **The sidebar folds to a 46px rail** of slide glyphs, its width easing as
  the app rail's does (width, min and max pinned together) and the fold
  remembered (`useResizablePanel`, `oculus-ed-lesson-sidebar`). The column
  stays laid out at its open width, so a fold clips it and nothing
  re-truncates, and the header keeps one height, so the glyphs never move
  up or down. Folded, each slide's button is a 30px square round its glyph,
  as the app rail's are, so the active fill and the tooltip (the slide's
  title) sit on the glyph; the label is the button's sibling, so it fades
  (`SIDE_NAV_FOLDS`) rather than squeezing. The toggle centres on a
  challenge slide's 40px strip, and a small tick (completed) or a brand dot
  (not yet opened in Ed) fades in on each glyph. The list's scrollbar is hidden,
  as `SideNav`'s is, so glyphs and toggle share one centre line.
- **The pane shows the selected slide through `FileViewer`**: a PDF slide's
  PDF, any other slide's `.md`, both found by path beside the index
  (`slideFiles`). A slide whose rows a sync has not stored yet says so
  quietly. Links inside a slide open beside the page, as any file's do.
- **A challenge slide switches Description | Workspace, as Ed does** (a
  slide with a `challenge_id`, `code` or `jupyter`: `isChallengeSlide`). A
  40px strip over it (`ChallengeHeader`) holds the switch (`PillTabs`) and an
  Open in Ed pill that opens the slide's `url` from the index
  (`openLinkOut`: an in-app tab, ⌘-click the system browser), since editing,
  Run and Mark happen on Ed. Each slide opens on Description: its `.md`, the
  brief, through `FileViewer`. With Workspace shown, a Resync pill before
  Open in Ed fetches the challenge's files from Ed now (`resyncWorkspace`,
  [sync.md](./sync.md)); while it runs it shows a spinner and is disabled, until Rust answers.
  The outcome is a muted line beside it, "Up to date" or "2 updated · 1 new
  · 1 removed", that fades after four seconds; a failure stays as short
  `text-destructive` text, the whole message in its tooltip. Nothing is
  uploaded to Ed.
- **Workspace shows the challenge's synced files, read-only**
  (`WorkspacePane`): the rows under the slide's folder `<NN>-<slide-slug>/`
  beside its `.md` (`slideWorkspace`, [sync.md](./sync.md)), as Ed's tree in
  a 208px column (`WorkspaceTree`: folders first, then files, each by name,
  workspace-relative), and the chosen file beside it, the first until one is
  picked. Each column is its own one scroller; ↑/↓ step through the files.
  Showing a file stamps it accessed. The shown file remounts when a sync or
  Resync rewrites it (its key holds `content_changed_at`), so it reads the
  new bytes and the tree stays as it is. A slide whose folder holds no rows yet
  says so quietly. Nothing in the pane edits (`WorkspaceFileView`, by
  `workspaceView`): an image shows as itself, a PDF in `PDFViewer`, a video
  in a bare `<video>` (the library's player would write a transcript into
  the mirror), Office files, spreadsheets, archives and audio as a "No
  preview" note, and every other file — source, `.ipynb`, `.md`, `.txt`,
  `.csv`, files without an extension — as its text in `CodeFileViewer`; one
  that is not UTF-8 text gets the same note.
- **The slide rides in the URL** (`&slide=<Ed id>`, written with
  `replace`), so a restored tab or Back reopens it; without one the view
  opens on the first slide not completed (by the synced index, so a tick
  gained here never moves it). Showing a slide stamps its rows accessed, as
  opening a file does; the page stamps the index.
- **Showing a slide tells Ed** (`markSlideOpened`, once per app session,
  [sync.md](./sync.md) has the requests), and the status Ed then holds —
  `seen`, or `completed` for a reading slide — goes into
  `useSlideStatusStore` (`lib/ed/slideStatus.ts`). The sidebar, its count and
  the Lessons tab's rows read the index through it (`useLiveLessonIndex`),
  which only ever raises a status, so a tick shows at once rather than at
  the next sync. The store is persisted (`oculus-ed-slide-statuses` in the
  webview's storage), so a restart keeps what it learned, and the Lessons
  tab fills it on open with Ed's own statuses for the subject's lessons
  (`refreshSlideStatuses`, [sync.md](./sync.md)). A challenge slide is
  completed by a passing Mark on Ed; its tick arrives when the slide is
  next shown here, with that refresh, or at the next sync.
- **A lesson file without front matter** (every slide in one file) renders
  as plain markdown, like any library file.

## One code editor for source files

`CodeEditor` (`app/src/components/code/CodeEditor.tsx`, loaded on demand
through `LazyCodeEditor`) is a CodeMirror view that fills its box and
scrolls itself, with a fixed gutter on the card's fill. It borrows the note
editor's Raw look and line numbers (`rawCodeChrome` in
`components/documents/editor/chrome/rawMode.ts`) and its code colours
(`codeHighlight`), and takes the grammar from the file name
(`fileLanguage`: language-data's extensions, `.m` as MATLAB), loaded on
first use. The indent unit is the one the file uses (`detectIndent`: tabs,
or the commonest step of 2–8 spaces, else 4); Tab indents. A new `text`
prop it does not hold is applied as one minimal change outside the undo
history (`textChange`), so another copy's edit keeps the caret. `readOnly`
turns editing off; the Edit menu's Undo and Redo reach it while focused.

## One media player plays lectures and library videos

`useMediaPlayer` and `MediaPlayer` (`app/src/components/media/MediaPlayer.tsx`)
are the player: clock, control bar, scrub preview, speed, volume, keys,
fullscreen, captions and the dock's frame (`MediaDock`). The caller owns the
element and the dock's tabs. It hands its element over with `attach(v)` from
its own effect and calls the returned detach on cleanup; it passes slots for
what only it has — frames, an overlay, bar buttons, the line above the scrub
bar. Every video streams from Rust's media server via `mediaSrc()`
(`app/src/lib/lectures/media/src.ts`, absolute or library-relative), not `convertFileSrc`
([architecture.md](./architecture.md)).

- **A paused seek moves the picture** — scrub bar, arrow keys and the dock all
  go through `seekTo` (`usePlaybackEvents.ts`): one seek in flight, the newest
  target winning, a keyframe `fastSeek` and then the exact time, the way the
  scrub preview seeks. The clock holds the target until it lands. Playing, a
  seek is a plain `currentTime`.
- **`LecturePlayer` adds the lecture's layers**: the shared elements and their
  owner (below), two sources with PiP and stack, chapters, chat, downloads and
  progress.
- **A video file in the library opens in the file page**
  (`openFileSmart` and `filePageHref` route `isVideoFile` there, not to the
  system viewer), where `VideoFileViewer` renders its own `<video>`. Its
  captions are the sibling `<video>.vtt`, and one that exists but won't read
  is an error, never a Transcribe offer. The element pauses when its tab goes
  to the back, since nothing parks it, and keeps no position. A
  `drive-changed` naming the file in `added` (a Studio re-render replacing
  it) reloads the element on a fresh URL; one naming its `.vtt` re-reads the
  captions.
- **A Studio render uses it two ways** (`VideoPlayer`, see
  [studio-page.md](./studio-page.md)): on a video's detail page with a dock
  (Script and Scenes in a `MediaDock`, sharing the dock size and open state
  with lectures but keeping its own side, passed as `dockSide`; `dockKeepWidth` asks the picture to keep more than
  300px beside a side dock), and inside a chat thread without one
  ([harness.md](./harness.md#a-studio-thread-carries-its-video)). `dock` and
  `dockLabel` are optional, and with no dock there is no dock button, no
  resize handle and T does nothing; `captions={false}` leaves out the captions
  button. `useLibraryPlayback` is what `VideoFileViewer` and Studio's element
  share: pause with the tab, and one sound across lectures and library videos.
- **Course ▸ Media holds the downloaded videos** from module links and
  Canvas-page embeds. Drive lists them as files alongside any `.vtt`
  captions. The Modules page offers downloads for module videos that have
  no local copy.
- **One sound at a time**: a library video playing pauses the lecture
  (`pauseLecturePlayback`) and other library videos; a lecture's leader
  playing pauses every registered library video (`registerLibraryVideo` in
  `app/src/lib/lectures/media/library.ts`).
- **A video without a transcript offers Transcribe** in its Transcript tab
  (`TranscribeEmpty`). Runs live in `useTranscription`, outside React, so a
  player opened mid-run shows the run; a finished run fires
  `TRANSCRIBED_EVENT` and stays `done` (a spinner, no second Transcribe)
  until the player has read the cues and calls `settleTranscription`. A lecture transcribes
  its `source1.mp4` and records the VTT in `lectures.transcript_path` in the
  run's `after` step, which runs even if the player has gone. Echo360's own
  transcript is still fetched by T and the dock button.

## The lecture player's elements outlive the page

- **`app/src/lib/lectures/playback/` owns the `<video>` elements**, so playback
  survives tab switches. Between players they park in a 480×270 off-screen
  host — `display: none` lets WebKit stop playback, and a tiny host decodes
  tiny. Progress saves every 5s and on pause, seek, end and `pagehide`,
  chained so writes land in order.
- **Done is the lecture's end, not the file's.** A progress write within 10 s
  of the found content end ([chapters.md](./chapters.md#where-the-lecture-ends))
  marks the lecture complete; without one, within 30 s of the file's end.
  `lectureEnd` in `app/src/lib/lectures/end.ts` is the one place that end is
  chosen, from the latest state of the end job rather than the player's row,
  and Up Next reads it too. So does `progressLabel`, the lists' "x left",
  counted to that end.
- **Done is also a toggle.** The status circle at the left of a `LectureRow`
  marks the lecture Done or not (`setLectureDone`). Marking keeps the
  position, since it may not have been watched; unmarking one watched to its
  end starts it over, or the next progress save would mark it Done again.
- **One player owns the elements** (`app/src/lib/lectures/playbackOwner.ts`). A tab's
  main page and its side panel can both be lecture pages; a player never takes
  the elements on mount from an owner in its own tab — only a player in the tab
  now in front, or any player once nobody owns them (a stop, or a paused owner
  unmounting). A user action claims them (`claimPlayback`): Play here, Space,
  or a seek from the dock; the claimed pane adopts once it shows that lecture.
  A player without them draws a still over its frames — title, "Playing/Paused
  in the other pane", a "Play here" pill — and never touches the elements; the
  frames stay mounted under it so the elements are never detached.
- **Only the focused pane's player hears keys.** Owning, every key works; not
  owning, Space takes the video over and Escape leaves fullscreen.
- **Leaving a playing lecture asks at the door** — the strip's × and
  `navigateActive` / `goInActiveTab` call `confirmLeavingLecture` — never
  through a router blocker, which strands the pane when nobody answers.
- **Two streams, one clock.** The main-frame source leads (audio, clock,
  progress); followers play at its rate and are corrected only by seeks
  (`follower.ts`). A follower further than `MAX_DRIFT` from the playing leader
  seeks ahead by `seekLag`, the time a seek takes to play again, learned from
  each landing once it has settled (`SETTLE_MS`, since `currentTime` reads the
  target until playback restarts). The leader's own `seeked` sends followers
  to its exact time, as both restart together. Never trim a follower's rate:
  WebKit stalls a playing video on every `playbackRate` change (about 0.25 s at
  1×, a second at 2×), so a late follower trimmed on and off cycled 0.3–0.9 s
  behind for good. `syncLectureSources` takes the whole plan, so only it can tell
  a fresh lecture (resume) from a source switch (keep the second). Speed and
  volume re-apply per leader element, since both reset on load. A click on
  either stacked picture plays and pauses (`attach` listens on the leader,
  `useSharedElement` on the follower); the PIP is a drag handle.
- **Fullscreen is the Tauri window plus a `fixed inset-0` overlay**: element
  fullscreen shows only its subtree, and the player's Radix popups portal
  outside it. A lecture in the side panel is the full lecture page, dock and
  fullscreen included.
- **Preferences are global** (`playerPrefsStore`); only the position is per
  lecture. The clock counts against the leader's duration, not the catalogue's.
- **The dock is Chapters, Transcript and Chat** in a reorderable `ViewTabs`
  strip, always mounted because Chat needs no file. Transcript is dropped only
  while a transcript on disk has no cues loaded; a lecture without one keeps it
  for Transcribe. `useTranscriptDock` raises
  the floor for Chat and caps the drawn size by the container (`KEEP_W` /
  `KEEP_H`), dropping a side dock to the bottom when it can't fit — without
  rewriting the preference. While the tab's side panel is open, lectures in
  either pane draw the dock at the bottom, including when it is reopened.
  Hiding or closing the side panel, expanding the lecture to a full-width tab,
  or entering player fullscreen restores the saved side when there is room.
  The header offers a dock drag grip only when all four edges are available;
  split and narrow players stay at the bottom with no grip or grab cursor.
- **The transcript is virtualised** (~2500 cues a lecture) through `FollowList`.
  Following is tracked by pointer *intent*, since the follow-scroll fires
  `scroll` too, and runs off the active-cue index rather than `timeupdate`.
  Don't call `measure()` on a search: heights are cached by cue key and survive
  it. Key callbacks stay stable between searches so a playback highlight does
  not rebuild every row's offsets. Chapters are [chapters.md](./chapters.md).

Playback's ordered cue and chapter starts use an upper-bound lookup,
including the last entry when timestamps coincide. A player subscribes only to
its lecture's download progress; stable dock callbacks keep playback ticks
outside the transcript's memo boundary. The catalogue's `LectureRow`
(`app/src/components/lectures/LectureRow.tsx`) reads only its own
source-qualified download progress and active state.

## Up Next offers the subject's next lecture

`UpNextCard` (`app/src/components/lectures/UpNext.tsx`) is the card the
lecture player shows bottom-right in the frame once the lecture is over.

- **Next** is `getNextLecture`: the same subject's earliest strictly later
  `date`, ties by title then id, Done or not. None, no card.
- **It shows** while the playhead is at or past `upNextFrom` — the found end,
  else 20 s before the file's — and the player holds the element. Seeking back
  hides it; × hides it until the lecture is opened again (player state).
- **It goes through `MediaPlayer`'s `overlay` slot**, so it is inside the video
  area and therefore inside the fullscreen overlay. `z-35` puts it over the
  control bar's scrim (`z-30`) and under the other pane's still (`z-40`); while
  the bar shows it is lifted by a fixed translate, never a measurement, so page
  zoom holds. It has no keys of its own; Space still plays the lecture.
- **No countdown while the file plays** — the Q&A may be wanted. `useEnded`
  watches the element's `ended`; then the Play pill fills over 8 s and plays.
  A play, seek, pause, new source or × cancels it. Under
  `prefers-reduced-motion` the fill is hidden and the pill counts "Play in 5".
- **Play** awaits `completeLecture` (pause, the last progress write, then
  `markLectureComplete`, on the same chain so no write lands after), sets
  `playOnAdopt` and replaces the pane's route with the next lecture page. Same
  route, so the page and player stay mounted (fullscreen too); the next
  `syncLectureSources` for that lecture plays it, from the start if it was
  already watched. The player tags its media URLs with their lecture, so the
  last lecture's file is never adopted under the new one's id.
- **The thumbnail** is `lecture_thumbnail`: one `grab_frame` (with its probes)
  a quarter of the way in, source 1 else source 2, 320 px wide, cached as
  `thumb.jpg` in its recording folder (written aside and renamed). An image, so the card
  loads it over the asset protocol with `convertFileSrc`, not the media
  server. Not downloaded, it returns nothing and the card shows the subject's
  icon and a Download pill (`lectureDownloadStore`) in place of Play; the
  download's event re-reads the next lecture.

## Dictation transcribes private microphone clips

`dictation_status` checks the same configured engines and ffmpeg as video
transcription without running inference. `dictation_transcribe` accepts a
nonempty clip of at most 24 MiB, writes it into the pipeline's scratch
directory, decodes it with ffmpeg, and reuses the engine-order and chunking
logic. It returns `{ text, groqUsage? }`: the joined segment text with no
timestamps or VTT file, and, when Groq transcribed it, Groq's reading of its
allowance from that answer ([below](#groqs-answers-say-how-much-allowance-is-left)); scratch
audio is removed on success and failure. No speech is an error. The macOS
`app/src-tauri/Info.plist` supplies the microphone permission description for
the WebView's capture request; `app/src-tauri/Entitlements.plist` grants
audio input to the hardened release bundle. The composer owns recording and
the subsequent cleanup
([harness.md](./harness.md#dictation-adds-an-editable-message-to-the-draft)).

## Dictation cleanup: Groq or S1-mini, as chosen

`dictation_cleanup` (`app/src-tauri/src/transcribe/cleanup/`) turns a
transcript of 1 to 100,000 bytes into the message the speaker meant. The
`transcribe` settings row's `cleanup` and `cleanupFallback` keys (`Choice`
in `cleanup/mod.rs`) say how:

- **The model**: `groq` (Groq's Qwen), `s1Mini` (S1-mini by Superwhisper)
  or `off`, which returns the transcript as heard without reading a key or
  loading a model.
- **The fallback**: when on, the other model answers if the chosen one is
  not set up (no key, not downloaded, or S1-mini on Windows and Linux) or
  its call fails for any reason (a 429 included; nothing is retried).
- **The default** is Groq with the fallback on. `auto`, the default's older
  stored name, a missing or unknown model, read as Groq; a missing
  `cleanupFallback` is on for those and off for a model stored by name, as
  those meant before the key existed.

`run` reads each route only when an attempt needs it: S1-mini with no
fallback never touches keyd or the keychain, Groq never loads S1-mini unless
it is the fallback and Groq did not answer, and Off reads neither.

- **Groq** reads the transcription key the way transcription reads it
  (`settings::groq_auth`): through `oculus-keyd` when it is installed, so the
  key never enters the app, else from the keychain. It is one chat
  completion to `qwen/qwen3.8-27b` (`groq.rs`): temperature 0,
  `reasoning_effort: "none"`, `max_tokens` 900 (the free tier's output cap
  is 1,000), the brief in `brief.rs` as the system message and
  `<transcript>…</transcript>` as the user message. The brief resolves
  self-corrections, drops fillers, keeps the speaker's words and tone, writes
  numbers as digits and spoken maths as `$…$`, and keeps every part in its
  own language and script. A reply cut off at the cap is a failure.
- **Errors**: without the fallback, the chosen model's failure surfaces, or
  for one not set up, what to set up. With it, a failure the other could not
  cover surfaces; both failing names both in the order tried ("Groq: …;
  S1-mini: …"); neither set up says to add a Groq API key or download S1-mini
  in Settings → Transcription (on Windows and Linux, a Groq key only). The
  composer then offers Use original transcript, and Open Transcription
  settings, which opens that page in its setup dialog
  ([harness.md](./harness.md#dictation-adds-an-editable-message-to-the-draft)).

S1-mini is a 0.6B normaliser (Qwen3-0.6B fine-tuned; Apache 2.0 plus a term
that it is always named "S1-mini" by "Superwhisper", written exactly so).
`s1/` runs it through llama.cpp's `llama-server`:

- **Input** is the format it was trained on, word for word: its own system
  prompt, then a user message of the control line
  `[Styling: semi-formal] [Structure: lists] [Context: general]`, a newline
  and the transcript (`s1/text.rs`). Temperature 0. Thinking is off through
  the chat template — `--jinja --reasoning off`, which in the pinned
  llama.cpp sets the template's `enable_thinking` to false and opens the
  assistant turn with the empty `<think>\n\n</think>\n\n` the model expects
  (`--reasoning-budget 0` degrades it).
- **Output** is capped at 1.3 × the input's tokens + 32, the tokens estimated
  as characters ÷ 4 (an overestimate: 445 characters of speech are 88
  tokens); a reply that hits the cap is a loop and fails. An empty reply —
  filler-only speech — is an answer.
- **Length**: a transcript over about 1,000 estimated tokens is cut after
  sentence ends (or line breaks; a run-on sentence between words), each
  piece cleaned on its own, and the pieces joined with a space, or a blank
  line beside a piece that holds a list.
- **English only**: when the transcription language is set to another
  language, or the transcript has letters outside the Latin script, the
  transcript comes back unchanged and the model never runs.
- **Files**: `s1-mini-q4_k_m.gguf` (484,219,808 bytes) with the repo's
  `LICENSE` and `NOTICE`, which must stay beside it, pinned to commit
  `34add00a` of `superwhisper/s1-mini-GGUF` with their sizes and SHA-256s
  (`s1/model.rs`), downloaded on request into `<app data>/models/s1-mini/`
  through the same model-pack downloader as Studio's
  (`runtime::onnx::Pack`), licence first. Never bundled.
- **The server** starts on first use on 127.0.0.1 at a port the OS picks,
  with `-m <model> -c 4096 -np 1 --temp 0 --jinja --reasoning off --alias
  oculus-s1-mini`, its output in `llama-server.log` beside the model; it
  loads in about 0.3 s and holds about 1 GB (RSS) with Metal, and a cleanup
  takes 0.05–0.3 s. `dictation_warm`, called when a recording starts, loads it
  early when S1-mini is the model, or Groq's fallback and Groq has no key; it
  does nothing otherwise, nor when S1-mini is not installed or when the
  language is not English. It stops after 5 minutes without a request, when
  S1-mini is removed and when the app exits (`RunEvent::Exit`). It runs under
  a `/bin/sh` watchdog that holds a pipe from the app and kills the server
  when the pipe closes, so a crashed or force-quit app takes its server with
  it; at launch, `sweep_strays` kills any process of ours carrying the alias
  that launchd adopted.
- **Platforms**: the sidecar is built for macOS only
  ([development.md](./development.md#llama-server-is-built-from-a-pinned-release)).
  On Windows and Linux S1-mini is unavailable and only Groq cleans.

Settings → Transcription's Dictation cleanup block calls these; none but
`dictation_cleanup` calls Groq's chat endpoint:

| Command | Arguments | Returns |
| --- | --- | --- |
| `dictation_cleanup_status` | — | `{ choice: "groq" \| "s1Mini" \| "off", fallback, engine: "groq" \| "s1Mini" \| "off" \| "none", groq: { configured, model, error? }, s1Mini: { name: "S1-mini", by: "Superwhisper", label: "S1-mini by Superwhisper", status: "missing" \| "downloading" \| "present", bytes, unavailable?, running, englishOnly } }` — `choice` is the stored model and `fallback` whether the other steps in; `engine` is what a cleanup tries first under them, `none` when it has nothing set up; `unavailable` says why S1-mini cannot run here (another OS, or no helper in a dev checkout) |
| `dictation_s1_download` | — | resolves when the three files are on disk; rejects with `cancelled` on a cancel. Progress arrives as `dictation-s1-progress` events: `{ phase: "downloading" \| "complete" \| "cancelled" \| "error", received, total, error? }` |
| `dictation_s1_cancel` | — | `boolean`: a download was running |
| `dictation_s1_remove` | — | bytes freed; stops the server first |
| `dictation_warm` | — | `void`; the composer calls it at record start |
| `dictation_cleanup` | `{ transcript }` | `{ text, groqUsage? }`: the cleaned message, possibly empty, and Groq's reading of its allowance when Groq answered ([below](#groqs-answers-say-how-much-allowance-is-left)) |
| `groq_usage` | — | `{ models: [Reading] }`, the latest reading of each Groq model used since launch; memory only |

## Videos without captions are transcribed

Echo360 publishes WebVTT captions; other videos in the library have none.
`transcribe_video` (`app/src-tauri/src/transcribe/app.rs`) takes one video —
absolute, or relative to the data directory — and writes its transcript beside
it as `<video>.vtt` (`Week 1.mp4` → `Week 1.mp4.vtt`), returning that path. It
knows nothing of lectures or the database: a caller that tracks transcripts
records the path itself. `transcribe` in `app/src/lib/lectures/transcribe/engines.ts` is the
frontend's call; `oculus transcribe` is the terminal's.

1. The path is canonicalised and must land inside the data directory, so
   neither `..` nor a symlink reaches a file outside the library.
2. ffmpeg decodes the first audio stream to 16 kHz mono Ogg Opus at 24 kbit/s
   (constrained VBR) — about 11 MB an hour, so most recordings are one upload.
   The audio lives in a private temp directory, never in the library.
3. Audio over the engine's upload cap is cut by time into the fewest equal
   spans (stream copy, fixed boundaries, no overlap); each span's segments are
   offset by its start.
4. The VTT is written atomically after the last span returns. A failed span
   fails the run, and a run that heard no words is an error, never an empty
   transcript.
5. Progress is `transcribe-progress`:
   `{path, phase, engine?, chunk, chunks, error?}`, keyed by the path as the
   caller passed it, with `phase` one of `extracting`, `transcribing`,
   `complete`, `error`. `engine` (`groq`, `apple` or `whisper`) rides on
   `transcribing` and `complete`, and the player names it ("Transcribing with
   local Whisper"); a fall-through restarts `chunk` at 1 under the next engine.

**Engines are tried in the order set in Settings → Transcription** — Groq,
local Whisper, then on-device speech until the user drags them into another.
Windows offers Groq only: local Whisper and on-device speech are hidden in
Settings and excluded from backend selection, even if their switches are stored.
A missing enabled Groq key fails the run with a Settings → Transcription hint.
An `Engine` turns one audio file into timed segments; the pipeline owns
everything else. `engines()` in `app/src-tauri/src/transcribe/settings/mod.rs` lists
the configured ones in that order before any decoding: Groq when it is on and
its key is saved (keyd's `has groq`, or the keychain when keyd is absent),
whisper.cpp when it is on, a model is downloaded
and `whisper-cli` is found, Apple's on-device recogniser on macOS when it is
on and its helper is found. With none, the run fails at once and says to set
one up in Settings → Transcription.

- **One settings row, `transcribe`**, holds the order, the language, each
  engine's switch and the dictation cleanup model and fallback:
  `{"order": ["groq", "whisper", "apple"], "language", "groq": {"enabled"},
  "whisper": {"enabled", "model"}, "apple": {"enabled"}, "cleanup",
  "cleanupFallback"}`, parsed once per
  run by `settings_from` in `settings/mod.rs` and mirrored by `parseTranscribeSettings`
  in `app/src/lib/lectures/transcribe/settings.ts`. A missing row, key or mistyped value reads
  as its default — the default order, every engine on, the default language,
  the model `pick` chooses, Groq cleanup with S1-mini as its fallback. An order keeps known names once each and appends
  any missing in the default order. Unknown keys survive both Rust and
  Settings, which rewrites the whole row (`writeTranscribeSettings`).
- **One language for every engine.** `language` is `auto`, a locale such as
  `en_AU`, or a bare code; absent, it is the default, English in the Mac's
  region. A row without it reads the older `apple.locale`, then
  `whisper.language`; Settings writes only the top-level key and drops those.
  Each engine derives its own form (`Language` in `settings/mod.rs`): Whisper's `-l`
  and Groq's `language` take the language part (`en`), Groq omitting it for
  `auto`; on-device speech takes the whole locale, and for the default, `auto`
  or a bare `en` its helper's default locale, since Apple has no
  auto-detection. The default is English rather than `auto` because
  auto-detection judges from the first 30 s, which is easily noise.
- **Only a decline falls through.** `EngineError::NotConfigured` (Apple's
  helper on a Mac before 26) and `RateLimited` (Groq's free tier), at any
  span, hand the run to the next engine: the extracted audio is reused,
  re-planned for that engine's cap, and what the first engine heard is
  dropped. `Failed` — a refused key, an unreadable file, a crash — always
  surfaces. When every engine declines, the error carries each one's reason.
- **`oculus transcribe --engine groq|whisper|apple`** uses that engine alone,
  with no fallback, though still not while it is switched off. The app always
  runs the whole order.
- **No timeout sits above any engine**, for the reason parsing has none
  ([parsing.md](./parsing.md#a-parse-takes-minutes-and-only-the-engine-bounds-it)).
- **Cues carry no identifiers**: `parseVtt` (`app/src/lib/lectures/media/vtt.ts`) would
  join a bare number line into the cue's text.
- One run per video per process, so a double click cannot spend the allowance
  twice.
- **Settings → Transcription is the Language select and the engine list.**
  The select offers Auto-detect, then on-device speech's locales when it
  lists them — the one engine that needs a region — else bare codes, English
  first, with a region shown only where a language has several
  (`languageOptions`). Each choice leads with its region's flag
  (`localeFlag`; a bare code takes the region it is most spoken in, Auto-detect
  a globe, and Windows, which draws flag emoji as letters, none); the popup
  shows about ten rows and scrolls, and typing a name jumps to it. The list is one bordered group in run order: a row
  drags to a new place (`useStripReorder`) or moves with the arrow keys on its
  handle, and carries a one-line status, its switch, and a button opening the
  engine's dialog — Groq's key, Whisper's models, on-device speech's
  availability and downloaded languages. Model downloads are held by the page
  (`useWhisperDownloads`), so a row's status follows one after its dialog
  closes.
- **Below the engines, Dictation cleanup** (`DictationCleanup`) is one
  bordered group of rows. Model is a select of Groq · Qwen 3.8 27B, S1-mini
  by Superwhisper and Off, each behind its mark (S1-mini offered on macOS
  only, unless already chosen), with a line saying what it does now or, as a
  warning, what to set up (`modelLine`). Fallback is a switch naming the
  model that steps in, warning when it is on but not set up
  (`fallbackLine`); it is not shown for Off or off macOS. Last is S1-mini's
  download row, Studio's `PackDownloadRow` with Superwhisper's mark (size,
  English only, runs on this Mac; Download with a percentage, a bar and
  Cancel, then Delete behind a confirmation), with `unavailable` as a
  warning beneath when its helper is missing; on Windows and Linux the row
  is not shown.
- **Groq leads the page** (`GroqCard`), since one key serves transcription
  and cleanup: its bolt, whether a key is saved, what it does, and Manage or
  Set up, which opens the same key dialog as the engine row. With a key, it
  lists the latest `groq_usage` reading, a figure per role through
  `usageRows` behind the toast's microphone and sparkle ("1,997 of 2,000
  transcriptions left today · resets in 3h 12m"), in the warning colour under
  a tenth, and until Groq has answered since launch, a line saying so.
- **Each engine row leads with its mark**: Groq's bolt, OpenAI's blossom for
  Whisper, and Apple's logo for on-device speech.

### Groq: Whisper over HTTPS

`whisper-large-v3-turbo`, one multipart upload per span, naming the language
unless it is `auto` (`app/src-tauri/src/transcribe/engines/groq.rs`).

- **Groq's free tier refuses uploads over 25 MB**; the budget is 20 MB
  (`UPLOAD_BUDGET`) because a cut by time can give one span more than its
  share of bytes.
- **The free tier also caps seconds of audio per hour and per day.** A 429 is
  `RateLimited` and says when to retry: `retry-after`, else Groq's own "try
  again in", else the reset header.
- **Saving the key lists Groq's models, which is free** — Settings never
  transcribes ([harness.md](./harness.md#no-model-is-ever-probed)). The probe
  runs in the app with the key just typed; the key is then stored through
  `oculus-keyd` when it is installed, else in the keychain
  (`app/src-tauri/src/providers/groq.rs`, shaped like `voyage.rs`).
- **With keyd installed, the upload goes through it**
  (`app/src-tauri/src/transcribe/engines/groq.rs`): a `forward` of the multipart body
  to `/openai/v1/audio/transcriptions` with no timeout, keyd adding the key
  ([architecture.md](./architecture.md#oculus-keyd-is-the-only-process-meant-to-read-its-key)).
  Both routes hand back the same status, headers and body, so the 429, 401
  and 413 messages read one way; keyd's own refusals say oculus-keyd could
  not send the request.

### Groq's answers say how much allowance is left

Every successful Groq answer — a transcription or a dictation cleanup, on
either route — carries `x-ratelimit-*` headers, which `Groq::post` hands to
`groq_usage::record` (`app/src-tauri/src/transcribe/groq_usage.rs`): requests
per day (`limit-requests`, `remaining-requests`, `reset-requests`) and tokens
per minute (`limit-tokens`, `remaining-tokens`, `reset-tokens`), per model.
The latest reading of each model is kept in memory with when it was read;
nothing is stored and no request is made to read it. A refusal keeps no
reading.

- **A reading** is `{ model, role: "transcription" | "cleanup",
  requestsLimit?, requestsRemaining?, requestsReset?, tokensLimit?,
  tokensRemaining?, tokensReset?, readAt }`: a missing or unreadable header
  leaves its field absent; a response with none keeps no reading. Resets are
  seconds after `readAt` (ms since the epoch), read from Groq's `7.66s`,
  `2m59.56s` form (`duration_secs`).
- **Audio seconds per day**, Whisper's real cap on the free tier, has no
  header, so it is never shown.
- **A dictation step returns its own reading**: `dictation_transcribe` when
  Groq transcribed the clip, `dictation_cleanup` when Groq cleaned it, each
  only if the reading was taken during that call (`groq_usage::mark` before,
  `since` after). In `app/src/lib/dictation/groqUsage.ts`, the dictation
  toast takes them through `usageRows` (a figure per reading: its requests
  per day, else its tokens per minute), as does Settings' Groq card; both
  warn under a tenth of a limit
  ([harness.md](./harness.md#dictation-adds-an-editable-message-to-the-draft)).

### On-device speech: a Swift helper

macOS 26's `SpeechAnalyzer` has no Rust binding, so a single-file Swift
program, `apple-speech`, wraps it and the engine
(`app/src-tauri/src/transcribe/engines/apple.rs`) spawns it like ffmpeg. It is free,
offline after the language's model is on the Mac, needs no permission prompt,
and reads the pipeline's Ogg Opus in one call — an hour of audio in about a
minute — so its cap is `None` and a run never splits.

- **Two subcommands, JSON on stdout.** `apple-speech locales` answers
  `{available, reason, supported, installed, defaultLocale}`.
  `apple-speech transcribe [--locale <id>] <audio>` downloads the locale's
  model when it is missing, then answers
  `{segments: [{start, end, text, words: [{start, end, text}]}]}`. Exit 3 is
  "not on this Mac" (before macOS 26, or the recogniser unavailable), which
  the engine reads as `NotConfigured`; any other non-zero exit is `Failed`
  with the helper's last stderr line.
- **The default locale is English in the Mac's region, else `en_US`** — never
  the system language, since the Mac may be set to another language while the
  lectures are English. Matches are exact: `supportedLocale(equivalentTo:)`
  answers an unsupported region differently from run to run.
- **A result is an utterance, up to half a minute**, so the engine splits each
  into cues of at most 7 s on its word timings: after a sentence end that
  fits, else after a clause break in the window's second half, else where the
  pieces come out most even. No cue is under 1.5 s unless a single word
  forces it.
- **Settings reads `apple_speech_status`** for the language select and the
  engine's row and dialog. It runs `apple-speech locales`: it lists what the
  OS has, never downloads a model, and answers `available: false` with a
  reason rather than an error.
- **The helper launches on any macOS the app does** (built for 10.15, with a
  synchronous `main`), so an older Mac gets exit 3 rather than a dyld crash.
  It ships as an `externalBin` from `app/src-tauri/tauri.macos.conf.json`,
  found by `app/src-tauri/src/runtime/bundled.rs` beside the executable or in dev's
  `binaries/`
  ([development.md](./development.md#the-speech-helper-is-compiled-not-fetched)).

### Local Whisper: whisper.cpp with a downloaded model

`whisper-cli`, built from a pinned whisper.cpp release
([development.md](./development.md#whisper-cli-is-built-from-a-pinned-release)),
runs a ggml model on this Mac — on the GPU through Metal on Apple Silicon —
free and offline once the model is on disk
(`app/src-tauri/src/transcribe/engines/whisper.rs`). It windows the audio itself, so
its cap is `None` and a run never splits; there is no timeout, since a long
recording on a large model takes minutes.

- **whisper-cli cannot read Ogg Opus**, so each call decodes the extracted
  audio to 16 kHz mono 16-bit WAV beside it in the run's temp directory, and
  reads back `-oj`'s JSON. A zero exit with no JSON is still a failure, named
  by stderr's last `error` line. Marker-only segments (`[BLANK_AUDIO]`,
  `(music)`, `♪`) are dropped.
- **Silero VAD skips silence**, where Whisper otherwise invents "Thank you."
  loops. Its model (under 1 MB) downloads before the first Whisper model; a run
  without it goes on without `--vad`.
- **Models live in `~/Library/Application Support/com.tchan.oculus/models/whisper/`**
  (`whisper_models::dir`), outside `courses/`, where folder
  scans and agents look. `MODELS` is a fixed catalogue of seven, worst to
  best; downloads come from Hugging Face without an account, stream to
  `<file>.part` and rename into place, with no deadline but a 60 s stall.
- **The model a run uses** is `whisper.model` when set — not downloaded, the
  engine is unconfigured rather than quietly using another — else the default,
  `large-v3-turbo-q5_0` (near large-v3's accuracy at a fifth of its size), if
  downloaded, else the largest downloaded (`pick`, mirrored by
  `pickWhisperModel` for the engine row and the dialog's Automatic choice,
  which clears `whisper.model`).
- **Fit is judged against total RAM**: a model needing more than half is
  marked too large (still downloadable), and exactly one is recommended — the
  default when it needs at most a quarter and a GPU runs it, else the largest
  needing at most a quarter, capped at `small` without a GPU (`fits`).
- **Settings only lists, downloads and deletes.** `whisper_models` reads the
  directory, the RAM size and whether `whisper-cli` is found, so it runs on
  every macOS visit; `whisper_download_model`
  resolves when the file is on disk (rejecting `cancelled` on a cancel) and
  reports through `whisper-model-progress`
  (`{id, phase, received, total, error?}`, every ~150 ms). A download in
  flight is flagged `downloading` in the listing, so a revisited page picks up
  its bar. The dialog lists the recommended model first and folds the rest
  under "Other models" unless one of them is downloaded or chosen. Deleting the chosen model clears `whisper.model` so `pick` chooses
  again.

## The in-app browser is a native page per tab, owned by Rust

A browser tab is `/browse/<id>`, naming a native child webview (WKWebView on
macOS, WebView2 on Windows) that
`app/src-tauri/src/shell/browser/` places at an empty slot in `BrowserPage`, seen
through a hole the app opens ([architecture.md](./architecture.md#native-pages-show-through-holes-the-app-opens)).
Canvas refuses iframes.

Browser pages receive the app's light/dark preference at
creation and whenever Appearance changes, including System mode. macOS sets
each child WKWebView's `NSAppearance`; the main webview keeps the OS
appearance so its System media query remains independent. On Windows,
Tauri forwards the window theme to WebView2 and new pages inherit it.
This supplies `prefers-color-scheme` to the sites, without rewriting their
colours or images. A site's explicit theme setting takes precedence; sites
without a dark theme retain their own colours.

- **Rust owns the tab list** and pushes `browser-state` on every change;
  `useBrowserTabs` reconciles it per *pane*. The mirror preserves unchanged
  page objects so another tab's snapshot does not rerender every pane.
  Page navigations change the URL in
  Rust only, never the route. What a page knows about itself (history, find,
  zoom) is pushed as events, because `with_webview` returns nothing.
- **An open tab's page is hidden only while its tab is backgrounded** (`useTabActive`).
  Popovers and the address suggestions (`AddressSuggestions`, a portal) draw
  over the live page. Hiding throttles a page's timers, and `browser_place`
  focuses it, so nothing else hides or re-places it.
- **Closing a tab ends its page unless a download still needs it**
  ([below](#downloads-wait-for-a-destination-while-their-bytes-arrive)).
  Destruction (`teardown.rs`) stops loading on macOS, pauses media and leaves
  fullscreen and picture-in-picture, then calls WebKit's `_close` in the
  WebContent process before `close()` drops the view. On Windows dropping
  the view calls WebView2's `Close()`. Every macOS `with_webview` goes through
  `shell::wk::with_view` so no retain keeps the destroyed page alive
  ([architecture.md](./architecture.md#the-main-window-holds-one-webview-per-browser-tab)).
- **A tab backgrounded for 15 minutes loses its page, not its tab**
  (`discard.rs`), as in Safari or Chrome's Memory Saver. "Backgrounded" is
  Rust's own record: no pane or side panel has placed it since it was last
  hidden or opened. One thread checks every minute, and on macOS a
  memory-pressure dispatch source (warning or critical) discards every
  eligible backgrounded tab at once. A page playing media or capturing the
  camera or microphone is kept (WebView2 reports audio only), as is a page
  with an unfinished download ([below](#downloads-wait-for-a-destination-while-their-bytes-arrive)).
  The page goes through the same teardown as closing; the tab stays in `browser-state` with its
  URL, title and zoom, so the strip and `useBrowserTabs` see no change.
  `browser_place` on a discarded tab makes a new page at that URL the way a
  new tab's is made (seeded cookies, theme, user agent, init scripts), off
  the main thread, and shows it once it exists. Back/forward history does
  not survive a discard. Navigating a discarded tab only changes the URL it
  will load.
- **Windows page creation runs off the main event loop.** `browser_open_url`
  is an async command so its tab ID or creation error reaches the caller without
  blocking WebView2. Popup tabs and the continuation after cookie seeding stay
  on worker threads; moving either back to the main loop deadlocks child creation.
  macOS popup creation is queued onto the main thread after the WebKit callback.
- **Windows browser pages and the login window share WebView2's default jar.**
  Cookie reads and writes run on worker threads: calling Tauri's cookie APIs
  on the main event loop deadlocks. Seeding copies both Canvas and SSO headers
  from keyd and reads back the jar until queued writes match before navigating.
  Sign-out deletes both hosts' cookies from the same jar.
- **Windows uses JavaScript for browser history, reload and find.**
- **History is one row per URL, ranked by frecency**, recorded on load
  *finish* (one row per redirect chain). `historyUrl` drops the fragment, and
  the whole query if any part looks like a credential.
- **macOS pages claim to be Safari** (`PAGE_USER_AGENT`) so UA-sniffing sites
  serve their full pages; Windows keeps WebView2's default user agent.
  An `initialization_script` reports a real
  `outerWidth`/`outerHeight` (a child view's are 0, which drops canvas renderers
  to minimum scale).
- **Pages get every plugin's init script.** `tauri-plugin-opener` is built
  with `open_js_links_on_click(false)`: its click handler would cancel a page's
  `target=_blank` links and call IPC pages cannot reach, so only ⌘-clicks got
  through. A `_blank` link reaches `on_new_window` and opens as a tab; the
  app's own links go through `AppLayout`'s capture-phase handler.

### Downloads wait for a destination while their bytes arrive

Every accepted browser download goes to
`.oculus/downloads/.incoming/<pid>-<id>/<name>` in the data directory, never the user's
Downloads folder (`app/src-tauri/src/shell/browser/downloads/stage.rs`). The
hook must name its destination synchronously and WebKit starts writing at
once, so the Save dialog asks while bytes arrive. Delivery waits for both the
last byte and a choice, whichever comes second (`Downloads`):

- **In Drive** imports into any folder of Drive's a file can land in
  (`drive_target`: the top level, a subject's root, or a folder of the
  student's in either) through `import_file_as` / `import_into` in
  `app/src-tauri/src/library/files/uploads.rs`, the same path as picked
  uploads, so a taken name with other bytes steps aside to ` (2)` and the
  same bytes keep their name and parse. `Dest` is
  `{ kind: "drive", target_dir, name? }`, `name` only when the student
  edited the file's; the row then shows the name it landed under. The
  dialog opens with a folder already chosen, drawn as a `Trail` from My
  Drive: the subject of the tab's Canvas course page, else the last folder
  any Drive picker confirmed (`drive_picker_last_destination`), else the top
  level (`app/src/lib/browser/downloads/destination.ts`), stepped up to the
  nearest folder that takes files when it is gone or synced. Save lands it
  there; **Change…** opens the Drive picker over the dialog with the name to
  edit, and the picker's Save is the save (a cancel leaves the dialog as it
  was). `useBrowserDownloads` writes the row through `recordUploads` in
  `app/src/lib/files/uploads.ts` via `createSavedRecorder` in
  `app/src/lib/browser/downloads/recordSaved.ts`, under the subject or the
  top level the saved path is in (`homeOf`): it claims each download once,
  skips an existing `files` row (including after a frontend reload), and
  starts the parse for pipeline files whose import has no conversion error.
  The row's id goes to `useBrowserDownloadsStore`'s `files`, so the list
  acts on the file after a move or rename in Drive. An Office conversion
  failure still leaves the upload saved, with its warning. A folder in a
  subject Oculus doesn't know has no home, so Save refuses it before choosing
  (`landingProblem` in `destination.ts`); a saved download no home holds
  says so once on its row (`unrecorded` in the store) and is not retried,
  while any other failure to record is tried again on the next list.
- **On this Mac/PC** opens the native save panel, initially in Downloads with
  the safe name suggested.
  `app/src-tauri/src/shell/browser/downloads/deliver.rs` moves the file,
  copying via a partial sibling across volumes; replacement is allowed only
  at the exact path the panel confirmed. A delivery failure keeps the staged bytes for another choice.
- **Discard** deletes the staged bytes. During receipt it marks the download
  discarded and deletes only at `Finished`; it cannot cancel the transfer.

Every save needs an explicit choice: `useBrowserPrefsStore` remembers only
which answer, In Drive or On this Mac, to preselect. A Canvas course URL in
the credited tab names its subject
(`app/src/lib/browser/downloads/subjectGuess.ts`), checking the institution's
Canvas host when known. `app/src-tauri/src/shell/browser/downloads/sweep.rs`
clears staging at startup except folders whose PID belongs to another live
process; the list itself lasts only for the app session.

- **WebKit downloads unshowable types, `<a download>` actions and
  `Content-Disposition: attachment` responses in any frame**, plus its
  Download Image, Download Linked File and Download Video context-menu items.
  A plain displayable PDF stays in its page; WebKit can ignore a cross-origin `download` attribute. Playing media
  is not a download. The vendored wry supplies attachment response policy,
  the private macOS context-menu delegate hook, accepted paths on completion
  and unnumbered suggested names. It also leaves the default download handler
  unset: on macOS the app's own and sign-in webviews download nothing. Without
  handlers Windows retains WebView2's engine defaults. The patch inventory is
  `app/src-tauri/vendor/wry/VENDORED.md`; its dependency check is in
  [development.md](./development.md#wry-is-vendored-at-the-version-tauri-resolves).
- **`Finished` matches by staged path**, never URL order
  (`app/src-tauri/src/shell/browser/downloads/correlate.rs`), so two downloads
  of one URL may finish in either order. WebKit reports an accepted path on
  success and failure; a pathless failure is a refusal or an orphan from a cross-origin download redirect, and is ignored. WebView2
  reports the path only on success, so its pathless failure is matched by
  URL hash within its page. Ambiguous groups wait until every member ends,
  then fail together if any failed. A pathless success logs that the vendored
  wry is not in effect and uses that same group matching.
- **A tab that has shown no page when its download starts closes**, with or
  without an opener. Its download is credited to the opener if one exists,
  otherwise to the closed tab. `useBrowserTabs` returns a strip
  tab Rust closes while in front to the tab it was opened from, if still open.
- **A closed tab's page lives until all its downloads report `Finished`**:
  the event only arrives from a live page.
  `app/src-tauri/src/shell/browser/layout.rs` parks it hidden;
  `app/src-tauri/src/shell/browser/teardown.rs` also silences its media on
  macOS. Parked pages take no page commands. Never call
  `Webview::url()` on a page: before a navigation commits it has no URL and
  that call panics. Use the browser's tab state or event payload instead.
- **The download URL is a credential.** Download records retain only its hash
  and host, never the URL; the download payload sends the host, and logs use
  the origin only, including the opening-tab and restoring-tab lines. This
  is the download-record contract; `browser-state` still carries tab navigation
  URLs. A `blob:` supplies its page's host and a `data:` supplies none.
- **Streaming manifests are refused before staging**, with a `refused` row:
  `.m3u8`, `.m3u` and `.mpd`, case-insensitive (the name rules below).
  Download Video can save a playlist instead of the video, and its segment
  URLs can be signed.
- **Names keep the engine's suggested final component**, including ordinary
  spaces and Unicode (`app/src-tauri/src/shell/browser/downloads/name.rs`).
  Controls are dropped, separators and Windows-invalid characters become
  underscores, edge dots and whitespace are trimmed, device names gain an underscore, and an empty name becomes
  `download`. Long names are cut on a UTF-8 boundary with a short extension
  preserved, leaving room for upload numbering and an Office file's `.pdf`.
  WebView2's proposal also has a Downloads-folder collision counter removed
  only when the unnumbered file really exists there; WebKit's name reaches
  the hook without that numbering.
- **Progress is bytes received, not a percentage**: the hook exposes no total
  size or mid-flight cancel handle. Receipt is measured from the staged file
  every 500 ms. There is no Retry: the hook often sees a redirected, expiring
  URL, and a POST or revoked blob cannot be repeated from it. A transfer
  failure exposes only a success flag, so the row says it failed and asks the
  student to start it again from the page; partial bytes are deleted.

`app/src/lib/browser/downloads/prompt.ts` owns when to ask. A download in a
tab in front (main pane or open side panel) opens the dialog; a background
download waits in the toolbar list. Switching tabs or dismissing the dialog leaves the download waiting,
without discarding or asking again automatically. A download-only tab closing
under its own dialog leaves it open; a popup's arrival allows up to three
seconds for the opener to return to the front. A save that could not land
returns to `ready` with its reason and asks again under the same foreground
rule (also when its tab has closed).

`DownloadsButton` appears after the first download this session and stays
after clearing the list. Its one dot is brand-coloured while a choice waits,
otherwise destructive-coloured for an unseen failed or refused download;
opening the list acknowledges problems. A waiting row opens the dialog. A
saved row says where it went as a `Trail`, from its subject when it is in
one, and every settled row has one ⋮ menu (`DownloadMenu`). Saved to Drive:
Open, Show in Drive (a new tab on its folder), Show in Finder, Clear from
list and Delete, which asks nothing: it sends the file to the Trash through
Drive's `delete_entries`, with the toast's Undo
([frontend.md](./frontend.md#a-delete-goes-to-the-system-trash-with-undo-until-its-toast-closes)),
and clears the row; each finds the file by its row id
(`app/src/pages/tools/browser/downloads/savedFile.ts`), and a file gone
since just leaves the list. Delete is offered only for a file the download
wrote, once its row id is known (`mayDelete` in
`app/src/lib/browser/downloads/deletable.ts`): a download whose bytes were
already in the folder (`ImportOutcome.existed`) landed on the student's own
copy. A file whose size on disk no longer matches its row (`stillRowFile`) is
another file now, so Delete only clears the list. Saved on the Mac: Open,
Show in Finder, Clear from list. Failed, refused or discarded: Clear from
list.

`useBrowserDownloads`, mounted once in `AppLayout`, mirrors the whole list
from `browser-downloads` into `useBrowserDownloadsStore`. States are `receiving`,
`ready`, `delivering`, `saved`, `discarded`, `failed` and `refused`;
`app/src-tauri/src/shell/browser/downloads/mod.rs` defines the field-level
wire types. `browser_downloads` supplies the mount snapshot;
`browser_download_choose` records a choice, `browser_download_save_panel`
returns a confirmed path or cancellation, `browser_download_reveal` and
`browser_download_open` act on a saved file, and `browser_download_clear`
removes a settled row without deleting its saved file
(`app/src-tauri/src/shell/browser/downloads/commands.rs`).
The dialog calls `browser_focus_app` in the browser's `commands` module on
Windows because DOM focus cannot take the keyboard from a WebView2 page;
it is a no-op elsewhere.
