# The Studio page

The rail's Studio section: browse every video, watch and export one, try the
components a video is built from, and edit the themes it is drawn in. Videos
are made in Chat, where the thread shows the video's card and plays it
([harness.md](./harness.md#a-studio-thread-carries-its-video)); Studio's New
video starts that chat. The renderer, the commands and the thread link are
[studio.md](./studio.md); this page is the frontend over them.

## Where

| Piece | Location |
| --- | --- |
| Routes, the nav column's width and fold, the page header row | `app/src/routes.tsx`, `app/src/layouts/StudioLayout.tsx`, `app/src/components/studio/StudioHeader.tsx` |
| The nav column: New video, Videos, Components, Themes | `app/src/components/studio/nav/` |
| Pages | `app/src/pages/studio/` (`VideosPage`, `VideoPage`, `VideoRedirect`, `ComponentsPage`, `ThemesPage`) |
| New video: a new Chat thread with the skill chip in its box | `app/src/hooks/studio/useNewVideoChat.ts` |
| Series grouping, outline navigation, and the chat each part is made in | `app/src/lib/studio/series.ts`, `app/src/lib/studio/seriesRequest.ts`, `app/src/lib/studio/threadRunning.ts`, `app/src/hooks/studio/useMakeSeriesPart.ts`, `app/src/stores/studio/seriesMakeStore.ts`, `app/src/stores/studio/seriesMakeState.ts` |
| A series' part on the video page and in the chat card: the series bar, the Parts outline, the frame of a part not made, and what each decides (`seriesView.ts`) | `app/src/components/studio/series/` (`SeriesBar.tsx`, `PartsOutline.tsx`, `UnmadePart.tsx`), `app/src/lib/studio/seriesView.ts` |
| The style chip in Chat's composer: theme, format, length, voice | `app/src/components/harness/composer/useStudioStyle.tsx`, `app/src/components/studio/style/`, `app/src/hooks/studio/useThemes.ts`, `app/src/hooks/studio/useThemeDefaults.ts`, `app/src/lib/studio/themes.ts`, `app/src/lib/studio/length.ts`, `app/src/lib/studio/voice.ts`, `app/src/lib/studio/setup.ts` |
| Player, render bar, the detail's dock (script, scene grid), facts, Render draft, the Export menu, the ⋯ menu that deletes the video and what a delete decides | `app/src/components/studio/video/` (`VideoDetailStage.tsx`, `VideoDock.tsx`, `RenderDraftButton.tsx`, `ExportMenu.tsx`, `VideoMenu.tsx`), `app/src/lib/studio/videoActions.ts`, `app/src/hooks/studio/useExportStatus.ts`, `app/src/hooks/studio/useVideoPlayback.ts`, `app/src/hooks/studio/useDockedFrameHeight.ts`, `app/src/hooks/studio/useSceneStill.ts`, `app/src/hooks/studio/useVideoDetail.ts`, `app/src/lib/studio/exports.ts`, `app/src/lib/studio/subjectCode.ts`, `app/src/hooks/studio/useSubjectCode.ts` |
| The Videos grid, its cards, series folders and subject pills | `app/src/components/studio/videos/` (`series/` for the folder and part cards), `app/src/lib/studio/seriesGrid.ts`, `app/src/hooks/studio/useOpenSeries.ts`, `app/src/components/ui/layout/MediaGrid.tsx`, `app/src/components/ui/layout/MediaRunCell.tsx`, `app/src/lib/ui/gridRun.ts`, `app/src/hooks/ui/useGridColumns.ts`, `app/src/hooks/ui/useGridMotion.ts`, `app/src/lib/ui/gridMotion.ts` |
| The theme and voice pickers, narrating from the page, the out-of-date note, and what each decides (`videoControls.ts`) | `app/src/components/studio/video/` (`PickerPill.tsx`, `ThemePicker.tsx`, `VoicePicker.tsx`, `RenderBar.tsx`), `app/src/lib/studio/videoControls.ts`, `app/src/lib/studio/narration.ts`, `app/src/hooks/studio/useNarrationStatus.ts` |
| Stills (`studio_frame`, `studio_thumbnail`) as object URLs | `app/src/lib/studio/stills.ts`, `app/src/hooks/studio/useStill.ts` |
| Render and narration state, the video list, the event bridge | `app/src/stores/studio/` (`renderStore.ts`, `narrateStore.ts`, `videosStore.ts`), `app/src/hooks/backend/useStudioEvents.ts` |
| The Components playground: list, stage, timeline, inspector, source, change box | `app/src/pages/studio/ComponentsPage.tsx`, `app/src/components/studio/components/` (`inspector/` for the props form) |
| The inspector column both editors share: fold, width, sections, compact fields | `app/src/components/studio/panel/` (`InspectorColumn.tsx`, `fields.tsx`), `app/src/components/ui/CollapsibleSection.tsx`, `app/src/hooks/studio/useInspectorSections.ts` |
| The playground's hooks: component list, source, stage frames, playhead, change flow | `app/src/hooks/studio/` (`useComponents`, `useComponentSource`, `useStageFrame`, `useStageWidth`, `usePlayhead`, `useLibraryChange`), `app/src/lib/studio/props.ts` (the form's sections, tooltips and changed-from-default), `app/src/lib/studio/changeRequest.ts` |
| The library choice both pages share, where an item comes from, own versions | `app/src/hooks/studio/useStudioLibrary.ts`, `app/src/components/studio/LevelMark.tsx`, `app/src/components/studio/components/OwnVersionActions.tsx` |
| The Themes page: list, sample scenes, header actions, token inspector, copies | `app/src/pages/studio/ThemesPage.tsx`, `app/src/components/studio/themes/` (`inspector/` for the token form), `app/src/hooks/studio/useThemeSource.ts`, `app/src/lib/studio/themeDraft.ts` |
| The colour control | `app/src/components/ui/color/`, `app/src/lib/ui/color.ts` |
| Paths | `app/src/lib/studio/routes.ts` |

## Six routes under one nav column

`/studio` opens the grid at `/studio/videos`, `/studio/videos/:slug` is a
video's detail (a series' part's too, made or not), `/studio/components` and `/studio/components/:name` the
playground, and `/studio/themes` and `/studio/themes/:name` the Themes page.
A saved tab on a path below a video's opens the video (`VideoRedirect`), and
any other Studio path the grid. `StudioLayout` owns the nav column's panel (`useResizablePanel`, ⌘⌥B and
each page header's toggle, as Chat's column) and reads the video list once;
a page puts its own `StudioHeader` row over its body. A video's title rides
in `?n=` (`videoHref`) because `tabInfo` titles a tab from its path alone,
and falls back to the slug. There is no Reels page. In the side panel (a
video opened beside its chat) a Studio page has no nav column and its header
no toggle: the panel's switcher, expand and × claim the row as on any page
built on `PageHeader` ([shell.md](./shell.md#the-side-panel-is-a-stack-of-items-beside-the-page)).

The rail's Studio item shows a brand dot while any render runs (a narration
does not light it); there are no toasts or bars ([ui.md](./ui.md)).

## New video starts a chat

**New video** (the nav column's first row and the empty grid's offer) opens a new chat of its own whose box already holds the `oculus-studio`
skill chip (`useStartVideo` over `useNewVideoChat`): it opens a new chat (`openNewChat`), writes
`/oculus-studio ` into its draft (`newChatKey`), which the box turns into the
chip once the skill catalogue loads, and opens `/chat?d=<id>&s=<id>` in the
subject the Videos grid shows (that course code's current subject, else its
newest), with no `s` while the grid shows All, and `c=1`, so Chat lands with
its subject picker (`NewThreadDialog`) open on that subject.
The agent makes the folder with `oculus studio new` and the app links it to
the thread ([studio.md](./studio.md#a-video-has-a-thread)).

**The style chip** sits beside the skill chip in Chat's composer while the
box holds it and the thread has no video (`useStudioStyle`), and holds the
theme, the format (Video or Reels, which is `portrait`) and the length. The length is Auto (the default: no target, the
agent decides), 30 s, 60 s, 2 min, 5 min, or Custom, a field that takes `45`,
`90s`, `3m` or `1:30` (`parseLength`; whole seconds, at least 5, else a
sentence under the field). The chip reads "Video · Auto", "Video · 90 s" or
"Video · 2:30". Until a theme
is picked by hand the chip shows the subject's default
(`studio_theme_defaults`' `effective`, marked "Default" in the list) and
sends none, so the backend gives the video that default by name; choosing a
subject brings its default. A theme picked by hand holds across a subject
change, and picking the marked default again goes back to following it.
Each theme row says where it comes from (an own version, the subject's,
global, built in). The format and length are remembered
(`oculus-studio-style`), a custom length as typed. Themes come from `studio_themes` for the chosen
subject; if the command rejects, the list is only "Default" and the popover
prints the reason. The popover's last line is the narration voice with a link to
Settings → Studio → Narration; while `setupProblems` finds anything missing it
is instead one warning line per missing piece, each with its Settings link. There is no sample button: a sample
would be a billed TTS call, and nothing in Settings makes one.

**The setup check.** A send that carries the skill chip first reads what
narration needs (`readSetupProblems`: the saved voice settings, Kokoro's pack
and voice status and the aligner's status, all local and free: nothing
synthesises or downloads) and checks it with `setupProblems`. A video needs a
configured voice (an engine and a voice; for the server engine also a URL and
model), and when Kokoro is the engine its model and pronunciation pack and
the chosen voice downloaded, and the word-timing model installed (a download
still running counts as missing). With any missing nothing is sent, the text
stays in the box, and each missing piece shows under it with an "Open
settings" link to the page that fixes it (Settings → Studio → Narration, or
Word timing). `voiceProblem` and `setupProblems` mirror Rust's
`voice::resolve` and the narrate checks, which stay the source of truth:
`oculus studio new` refuses when no voice resolves, which covers a video
asked for without the chip, and `narrate` refuses the rest.

## Renders live in a store, not in the page

`renderStore.active` is keyed by the video's absolute folder, holds the
preset, and is fed by
`studio-render-progress` (`useStudioEvents`, mounted with the other backend
bridges) and by `start`, which awaits `renderVideo`. The fraction is the
segments done plus the part of the current one, over all of them. An end,
however it ends, removes the entry, keeps a failure's sentence in `errors`
(and its preset in `failedPresets`),
bumps `settled[dir]` (a page showing the folder re-reads on it) and reloads
the video list. The store outlives navigation, so the rail dot, a grid
card's badge, a chat's video card and the page's bar all follow one render.

`narrateStore` does the same for a narration started from the video page:
`active` is keyed by the folder and holds the slug and the scene it is on
(`n` of `of`, and how many are done), fed by `studio-narrate-progress`
(`useStudioEvents`) and by `start`, which awaits `narrateVideo`
(`studio_narrate`). An end, however it ends, removes the entry, keeps a
failure's sentence in `errors` until the next narration of the folder starts,
bumps `settled[dir]` (the detail and the export statuses are read again on
it) and reloads the video list. Only the page shows it.

## Videos and the detail

The `studio_videos` response includes video rows and [series outlines](./studio.md#a-series-keeps-its-parts-in-order).
`listVideosAndSeries` exposes both, and `videosStore` holds `videos` and
`series` from one read. `listVideos` is a video-only convenience wrapper;
part rows remain in that array. Rows carry nullable `seconds` and the
thread linked to them (`threadId`); outlines carry `modified` and a video
row for every matching folder, including a part that has no render, so each
part names its own chat.

`lib/studio/series.ts` derives grid items sorted by modification time,
subjects including empty outlines, part membership, made neighbours, the
next unmade part, made counts and the series part a thread makes
(`seriesForThread`). Only a
part's actual `video` row claims it from the single-video grid: a missing
or unreadable outline cannot hide a video. Part lookup also leaves an
unrelated video at a reserved slug standalone. A series filters by its own subject.

**Each part is made in its own chat.** Every Make this part button (the
part's frame, the Parts row, the grid's part card and the chat's series
card) calls `useMakeSeriesPart`'s `make`, which opens a new chat through
`useNewVideoChat` with the request in its box, unsent, in the series'
subject: ``/oculus-studio Make part 3 of the series `shor` (video `shor-3`).``
(`seriesPartRequest`). The leading `/oculus-studio ` becomes the skill chip,
and the text names both slugs because the chat's first turn has no brief.
The student adds instructions, picks the model and sends; nothing is sent
from the Studio page.

A part asked for in a chat that already holds the series is made by a
subagent instead ([studio.md](./studio.md#agent-flow-a-chat-agent-makes-a-video-with-the-oculus-studio-skill)).
Nothing here knows it is a child: its `oculus studio new --series` links the
part to the child chat, and from then on `part.video.threadId` names it, so
the part's page, the outline, the grid and the series card follow the child
as they would a part's own chat. Until that command runs, no chat is named
for the part and it does not read as being made.

`seriesMakeStore` remembers which new chat each part was opened in
(`{series, part} → {draftId, threadId}`), in localStorage under
`oculus.studioPartChats` the way `draftStore` keeps drafts (read with
validation, written in a try/catch). Pressing the button again while that
draft is unsent shows the same draft (`useShowNewChat`, which refills the box
only if the student emptied it); a draft gone from Chat opens a fresh one.
When the draft's first send creates its thread, Chat's `onCreated` calls
`noteNewChatSent` before the draft is dropped, so the entry keeps its new
thread id; a draft that leaves `draftStore.newChats` with no thread id was
discarded and its entry goes. The composer empties a draft before its send
resolves, so a draft pruned in that moment gets its entry back when
`noteNewChatSent` arrives. An entry also goes once the part's folder is
linked to its chat (from then on `part.video.threadId` names the chat), when
the part is made, and when its chat is deleted (`keepThread` finds no
thread). A sent chat whose turn stops before the folder exists (a question,
Stop, narration not set up, a relaunch) stays the part's chat, so its card
and the part page's Open the chat still lead back to it. A folder with no
link (a part another part's chat made itself rather than through a
subagent), or one linked to an earlier chat that left it without a render,
keeps the entry too. The pure state is
`createSeriesMakeStore` in `seriesMakeState.ts`, tested without React.

A part's chat (`partThread`) is the one remembered for it, else the thread
linked to its folder. A part is **being made** (`partsBeingMade`) while it
has no render and its chat's turn runs, before or after its folder exists,
so several parts can be made at once. "Runs" is one definition everywhere
(`threadRunning`: the live map when it holds the thread, else the thread
row's status); the chat of a part not made that is older than Chat's newest
page of threads is read by id (`keepThread`).

The grid (`StudioGrid` over `MediaGrid` and `MediaTile`) shows single videos
and series folders interleaved newest first (`studioGridItems`). A video's
card is its thumbnail (`studio_thumbnail`, 16:9, a portrait one letterboxed
rather than cropped) with its length on the bottom right (`seconds`, none
until every scene has one), its title (video.json's `title`, else its title
card's, else the slug spelled out:
[studio.md](./studio.md#videos-live-in-the-data-directory)) and a fact line:
the subject (`SubjectIcon` and display code, through `useSubjectCode`), scene count and age. A video
that is rendering carries a badge with its percentage and a bar. One whose
video.json will not load shows the problem in place of its facts. Pills over
the grid narrow by subject (shown when two or more subjects have a video or
a series; the choice is remembered in `oculus-studio-subject`, which New
video also reads). With no video and no series the page offers New video;
the header has no button.

**A series is a folder card** (`series/FolderCard.tsx`): its frame holds a
slot per part in order, three to a row, a made part as its still and the
rest as empty dashed slots (past nine, the last slot counts the rest), and
its facts read the subject, "2/5 videos" and the outline's age. A press opens
it in place and a second press closes it (`aria-expanded`). Open, the folder
stays where it was and its parts follow it as cards (`seriesPartCells`): a
made part is a video's card with "Part 1" where the subject would be; any
other is an empty dashed card with its title muted and "Part 3" under it.
Every part's card opens its page (`videoHref`), made or not. The next part
not made holds **Make this part** (`useMakeSeriesPart`), a button beside the
card's own, never inside it. A part card being made (`partsBeingMade`) has
"Making…" with a brand spinner in its frame in place of the button, and
another part's card keeps its own state; the folder card itself draws only
its slots and facts. Which folders are
open is remembered (`oculus-studio-open-series`, `useOpenSeries`), and a
folder whose series leaves a successful read is forgotten.

**An open folder is a tinted run.** The folder and its parts are consecutive
cells that may start and end mid-row, so the run is a staircase whose shape
changes with the column count. `gridRunEdges` (`lib/ui/gridRun.ts`) takes the
column count, the run's first index and its length and gives each cell its
outer sides, outer corners and inside corners. `MediaRunCell` draws the tint behind its cell
out to half of each gap (`--media-gap-x`, `--media-gap-y`, set by
`MediaGrid`) plus half a pixel, so neighbouring cells' tints meet without a
seam and the gaps keep their size; a dashed brand line marks the outer sides
and the outer corners round, while inside corners stay square. The tint is
absolutely placed, so opening a folder moves other cards only by the cells
its parts take. `useGridColumns` reads the column count from the grid's
computed `grid-template-columns` (a count of tracks, which page zoom does not
change) and again whenever the grid's width changes.

**A press on a folder is animated** (`useGridMotion`). `StudioGrid` calls
`capture` before the toggle, which snapshots every cell's layout box
(`offsetLeft` and `offsetTop` against the grid, which page zoom does not
scale), and the commit that follows plays from it; `planGridMotion`
(`lib/ui/gridMotion.ts`) says what moved, entered and left. Cards after the
folder glide to their new cells (320 ms). Each part's tile is dealt out of
the folder, fading in and 35 ms after the one before it, while the run's
tint fades in where it lies, so the outline never travels in pieces. A
close is plainer: React has already removed the parts, so their elements go
back into the grid out of flow, at their old boxes, `inert` and under the
other cells, and fade where they are with the tint (120 ms); the cards wait
70 ms before they glide back, so none crosses a part half gone. A second
press mid-glide starts from where each card is drawn. Only a captured press moves anything:
a resize, a reload and the first draw of a remembered open folder do not,
and nothing moves under reduced motion. Tiles and run cells carry
`will-change-transform`, so a glide promotes no layer
([ui.md](./ui.md#gotchas)).

The detail (`VideoDetailStage`) is the player with a dock, and under it one
row: the facts (subject, theme, voice, length, shape) at its start, and the
render bar, the video's one button and its ⋯ menu at its end. The facts take
their pills' width, so when the end group no longer fits beside them it
wraps under them, still on the right, and a longer note never reflows the
pills.
The subject's pill is its icon and display code (`SubjectIcon`, keyed by the
course's current subject, `subjectCodeFor`).
Opened beside the chat that makes it (the video card's title or expand
button, [harness.md](./harness.md#a-studio-thread-carries-its-video)), it
reads the video again when that thread's turn ends or the folder's modified
time moves, so it follows the agent's edits; at side-panel widths the dock
goes under the picture (below). Playing it pauses the chat's inline player
and the other way round, as for any two library videos. The header holds
only the way back and the title. The row's button is **Render draft** while the video has no playable render (it starts
`studio_render` for `draft` through `renderStore`, and spins, disabled, while
any render of the folder runs, and is off while a narration does), and
**Export** once it has one.

- **The theme and voice pills** are pickers (`PickerPill`: the facts' pill
  with a small caret, opening a popover as wide as its rows, 176px at least,
  with no title, since the pill names it). Their rows take the model menu's
  look (`PICKER_ROW`): full-strength 12px text, lit only under the pointer,
  the current one ticked. A press saves at once and closes; neither has a
  confirm button. Both are off while a render or a narration of the folder
  runs or the video's thread runs a turn, with a tooltip saying which
  (`pillBlocker`); the setters themselves refuse while a render or a
  narration runs.
  - **Theme** (`ThemePicker`) lists the themes in effect for the video's
    subject (`useThemes` with the full subject code, `useSubjectCode`) as
    `ThemeList`'s `compact` rows: a swatch and the name, with the subject's
    default noted quietly and no source. A press saves it
    (`setVideoTheme`, `studio_set_theme`) and reads the detail, the list and
    the export statuses again; a refusal is a line in the popover. A theme
    video.json names by path shows as written, with no row ticked. Scene
    stills and the grid's thumbnail are keyed by the folder's modified time
    (scene stills by the theme too), so they redraw.
  - **Voice** (`VoicePicker`) lists Kokoro's downloaded voices, each its name
    and a muted "female" or "male", the one narrating now ticked (the
    video's own, else the Settings voice). A Kokoro voice reads by its name
    ("Heart"), on the pill too; any other id reads as written. A press pins
    that voice to the video (`setVideoVoice`); there is no "Default" row, so
    a video always names its voice here. A voice whose file is gone stays
    listed as "not downloaded". Under a hairline, "More voices in Settings",
    with a gear in the ticks' column, opens Settings → Narration; nothing downloads here. For a TTS server the
    popover is a field for the voice id with Save (or Enter); saving it empty
    goes back to the Settings voice. A reason narration cannot run now
    (`problem`) is a warning line, and a refused change a red one. The
    popover never narrates and has no sample, which would synthesise: after
    a change the clips are stale, so the render bar says the narration is
    out of date and offers Narrate.
  - **The narration status** (`useNarrationStatus`, `studio_narration_status`:
    local, nothing synthesises) is read once in `VideoDetailStage` for the
    voice picker and the render bar: when the page opens, when the video's
    voice, script or narration changes, when a narration of the folder ends,
    and when the voice popover opens.

- **The player** is the app's `MediaPlayer` over the newest video render
  (`draft`, `final` or `small`; `playableRenders`), `mediaSrc(path)` plus `&v=<mtime>` so a re-render of
  the same path is a new file to the element. With several, pills choose.
  When the render has its `.vtt` beside it, `studio_render_captions` reads it, `parseVtt` makes the cues
  and the bar gets its captions button; otherwise there is none (and none
  when the video's captions are drawn into the picture, `detail.captions`).
  No render shows "Not rendered yet", and the row under it offers Render draft. The scrub bar's notches
  are the scene starts. The element shares the app's one sound with lectures
  and library videos (`useLibraryPlayback`). The same player, without a
  dock, plays a video inside a chat thread
  ([harness.md](./harness.md#a-studio-thread-carries-its-video)).
- **The render bar** sits before the row's button: the render pills when
  there are several, and a note on the shown one (`renderNote`,
  `renderNoteWords`): when it was made ("Draft · 6h ago"), muted; after it
  "Out of date", in the warning colour with its glyph, and **Re-render**
  when its file is from an older version (its export state, below), which
  renders that preset through `renderStore`; or "Narration out of date", in
  the same warning, with **Narrate** while
  the narration no longer covers the script (`detail.timingProblem`) or the
  narration status counts stale clips, as after a voice change, shown
  even before any render. A video never narrated reads "Not narrated" with
  the same button once its thread is idle. Narrate is the page's one way to
  narrate: it starts the narration through `narrateStore`, and its tooltip
  says what it will do (`narrateHint`: "Narrates 5 scenes", or "Sends 5
  scenes to your TTS server"). It is off while the thread's turn or a render
  runs, or while the narration status gives a reason it cannot run, which is
  then its tooltip (`narrateBlocker`). Rust's own sentence for a preset that cannot
  render stays in the Export menu. A render in flight, of any preset (Render
  draft, Export and Re-render start them through `renderStore`), takes the
  bar's place with a bar naming the preset, the percentage and Cancel; a
  narration in flight does the same with "Narrating 4/12" (`narratingLabel`).
  A failure shows under the row (`RenderError`, `NarrateError`) and stays
  until the next render or narration starts. Rendering is local (ffmpeg), so
  unlike Settings it may start from the page; a narration starts only from
  the Narrate button.
- **The export statuses** (`studio_exports`) are read once for the row and
  the Export menu (`useExportStatus`, coalesced per folder): when the detail
  first loads, when a render or a narration of the folder ends, when the
  folder's modified time moves while its thread is idle (not on every write
  of a running turn), when the Export menu opens, and after a theme, voice,
  captions or bin change.
- **The dock** is the lecture player's (`MediaDock`, `useTranscriptDock`):
  the player's dock button, T and the dock's × fold it, its header drags it to
  an edge, its divider resizes it, and the side, size and open state are
  `playerPrefsStore`'s, shared with lectures ([viewers.md](./viewers.md)),
  except the side: a video's dock keeps its own (`oculus-studio-video-dock-side`,
  `DockSide` passed to `useMediaPlayer`), on the right until moved. Its
  tabs, **Script** and **Scenes** (the tab is remembered in
  `oculus-studio-video-dock-tab`), take the place of the lecture's Transcript:
  - **Script** (`ScriptPanel`) is the narration split by scene, with each
    scene's length. The scene under the playhead is lit, and the list follows
    it as the lecture transcript does (`FollowList`: nudge, Back to live,
    idle re-sync). A press seeks to the scene's start.
  - **Scenes** (`SceneGrid`) is a grid of the scenes' stills, as many columns
    as the dock's width allows, each with its number and length. The scene
    under the playhead is lit and scrolled into view when the playhead enters
    it, unless the pointer is on the grid. A press seeks.
  - Both are inert while there is no render, since there is no video to move;
    the Script still reads and the stills still draw.
- **The picture** is 16:9 beside or above the dock whatever its width
  (`useDockedFrameHeight` sets the frame's height from the frame's width, the
  dock's drawn size and the dock side), within `100vh - 14rem` and no shorter
  than 18rem; folding the dock gives the picture the whole width, and the
  height eases with the dock's slide. The page is the content's width up to
  1440px. The picture keeps 480px beside a side dock (`dockKeepWidth`): a
  narrower page draws the dock at the bottom without rewriting the preference.
  With no render the picture says "Not rendered yet" under the control bar,
  with no button of its own.
- **Export** (`ExportMenu`), the row's button once there is a render, is a pill over a popover of the presets, Draft,
  Final and Small ([studio.md](./studio.md#rendering-a-video)): each row names
  the preset and what it makes for this video's shape (`presetHint`), and its
  state from the export statuses above: a check when its file is current, "Out of date" in the warning colour
  when the file is from an older version, the reason when it cannot render
  now. Render (or Re-render) closes the menu and starts it through
  `renderStore`, so its progress is the render bar's; while any render or a
  narration of the video runs the buttons are off and the running row spins. A row with a file
  has Show in Finder (Show in Explorer on Windows, `revealItemInDir`) and a
  bin, Move to Trash (Move to Recycle Bin), which asks nothing, since the
  file can be rendered again: `studio_render_delete` moves the mp4 and its
  `.vtt`, then the detail, the list and the statuses are read again. The
  player falls back to the render left (`useVideoPlayback` shows the newest
  playable one when the shown one is gone); with none left, the row's
  button becomes Render draft and the popover goes with Export, and a
  series' part counts as not made again (below). The bin is
  off while any render or a narration of the folder runs. A failure to read the statuses
  or to move a file shows in the popover; a render's failure, under the row.
- **Captions in the picture** is the switch under the presets (hint: "Drawn
  into the frames, so every player shows them"), per video: `detail.captions`
  is video.json's `captions` and `setCaptions` writes it
  (`studio_set_captions`). A change re-reads the detail and the statuses, so
  the files made the other way show "out of date". With the switch on the
  player has no CC button, since the words are in the frames; with it off the
  CC button shows the render's `.vtt`. A failed write shows under the switch.
- **The ⋯ menu** (`VideoMenu`), a ghost icon button after Render draft or
  Export, holds **Delete video…**, red as other menus' deletes are. It is off,
  its tooltip saying why (`deleteVideoBlocker`), while a render of the folder
  runs ("Cancel the render first"), a narration of it runs ("Wait for the
  narration or cancel it") or the video's thread runs a turn ("The chat is
  still working on this video"). It asks first in `ConfirmDialog`:
  "Delete “title”?", that its script, narration and renders move to the
  Trash (the Recycle Bin on Windows), and for a series' part that the part
  goes back to not made (`deleteVideoPrompt`). Move to Trash calls
  `studio_video_delete` ([studio.md](./studio.md)) and spins while it runs;
  Rust's sentence for a refusal shows in the dialog, which stays open. Then
  the list is read again and `afterVideoDelete` says where the page goes: a
  part stays and becomes its not-made view once the list says so; a video
  open beside its chat closes that side item (`removeSide`); any other goes
  to the Videos grid. The chat's video card follows the list, so it goes
  with the row.

**A series' part** has the same page with three additions. The header is the
part's title with "Part 2/5" beside it (`StudioHeader`'s `meta`). Over the
picture, `SeriesBar` names the series (Phosphor `Queue`) and holds Previous
and Next, which skip parts not made (`partNav`); an off button's tooltip
names the part next to it ("Part 3 isn't made yet"), and they work from a
part not made too. Under the facts, the **Parts outline** (`PartsOutline`,
at most seven rows, never a scroller) lists every part's number, title and
question: a made part its length, the part on screen lit ("Watching"), a
part not made a dashed number. Only the next part not made offers **Make
this part** (`partRowKind`), unless it is being made; a row opens that
part's page. Each part being made (`partsBeingMade`) says "Making…" on its
row, however many there are.

**A part not made** opens at the usual route with no folder behind it.
`videoPageView` decides from the list (`seriesPartForSlug`) before a failed
detail read counts as an error, and shows the skeleton, not an error, while
the list loads; the detail is read only once the folder exists. The frame
(`UnmadePart`) holds the part's number, its question and Make this part
(any part not made offers it on its own page, whatever else is being made,
`partPageOffer`), which opens the part's new chat. While the part is being
made the frame says "Making “question”" and the status (`partStatus`:
"Starting" until its folder exists, then its video's progress line).
**Open the chat** opens the part's chat (`partThread`) and is offered
whenever the part has one, working or stopped, under the status or under
Make this part; nothing opens on its own. There is no dock, no facts, no Export and no ⋯ menu. The page
follows the part's chat: it reads the detail again when that chat's turn ends.
The list is re-read whenever a Studio call finishes or a turn ends
(`useHarnessEvents`), so when the part's folder and then its render appear
the same page becomes its player.

## The Components playground

`/studio/components/:name` shows one component of a library; the bare route
opens the first. The page's library select (global, or a subject by course
code) decides whose cascade `studio_components`, `studio_themes` and the
frames read ([studio.md](./studio.md#the-playgrounds-commands)); a name the
library lacks says so. The choice is one for this page and the Themes page
(`useStudioLibrary`, remembered in `oculus-studio-components-library`). Three
columns:

- **The list** groups the shells and the components. In a subject's library
  a row says where it comes from (`LevelMark`): "Own version" when the
  subject's file replaces a global one (`shadows`), "Subject" when only the
  subject has it, "Global" when it is inherited. A component that does not
  load is marked (`problem`, its sentence in the row's tooltip). A **Starter**
  pill (`StarterMark`) marks a name in studio-core's starter set
  (`STARTER_COMPONENTS`; `ComponentRow.starter`, `ComponentInfo.starter`),
  in the global library and in a subject's alike, whichever level holds the
  file and whether it was edited; a component the user made has none. The
  stage's header shows it beside the name.
- **Own versions.** In a subject's library the stage's header offers **Own
  version** on an inherited component, which copies the global text into
  the subject's library (`studio_component_write` at the subject level), and
  **Remove own version** on one that replaces a global component, which
  deletes the copy after a confirm (`studio_component_delete`; the text is
  kept in the library's history) so the subject falls back to the global
  one. Both reload the list and the stage.
- **The stage** (`Workbench`) is one component's centre column and inspector.
  The theme select lists `studio_themes` with each one's swatch (a theme that
  does not parse is listed but cannot be picked; the choice is remembered in
  `oculus-studio-components-theme`), the example pills pick a named example,
  and the frame is `studio_component_frame` at the playhead `t`, for a scene
  length of 2, 4 or 8 s, at the stage's width in device pixels (a step of 80,
  320 to 2160). The props it sends are always the inspector's whole set, not
  an example name, so an edit is just a new request.
- **The inspector** is generated from `props` and is a column on the
  stage's right (below). `str` and `latex` are a text field, `num` a number
  field, `bool` a switch, `oneOf` a select of the schema's values, `token` a
  select of the names in the chosen theme's `tokens` section (`color`, or a
  dotted path; a colour shows its dot; a theme without the section leaves a
  plain text field), and `list` an add control over items of the inner kind.
  A prop that is not set takes its default, which shows as the placeholder
  (a switch shows the default's state); an emptied number or an emptied text
  field on an optional prop unsets it. Nothing here edits the component.

**The inspector column** (`InspectorColumn`, the same on the Themes page)
holds a header row (a title and its actions: here the icon that resets the
props to the chosen example) over a scroller. The header's last button
(`InspectorToggle`, beside the library select) folds the whole column and the
stage takes its width; dragging the seam resizes it (264 to 420 px; dragging
it narrow folds it, as the nav column). The fold and width are remembered per page
(`oculus-studio-components-inspector`, `oculus-studio-themes-inspector`). The
column's content keeps its unfolded width while it eases shut, so it is
clipped, not reflowed. The stage's column may grow from 920 to 1080 px with
the inspector folded, and `useStageWidth` measures the stage, so the frame
request follows (up to 2160 device pixels).

**The props form** is in sections (`CollapsibleSection`, a caret, a name, a
count, and a brand dot while a folded section holds a change) that fold, each
remembered in `oculus-studio-components-sections` (`useInspectorSections`).
`groupProps` (`lib/studio/props.ts`) derives them from the schema and the
names, never from a component: a name that ends in a moment (`at`, `plotAt`,
`revealEach`, `zoomDur`) is **Timing**; a colour (`token`), a closed choice
(`oneOf`) or a switch (`bool`), alone or as a list, is **Style**; the rest is
**Content**. Fewer than six props, or only one non-empty group, is a single
"Props" section.

Fields are 28 px. A prop is its name on one line, with a small number,
switch or select beside it and text and lists under it. What it takes and
its default (`describeProp`, "List of numbers - default [-1,4,1]") is the
name's tooltip, not text beside it. A brand dot before the name means the
value differs from the default (`changed`; a required prop never does), and
an icon at the row's end, shown on hover, puts the prop back to its default
(or unsets it). A list of numbers is a grid of small fields, four to a line,
each with a remove badge on hover; any other list is a row per item with its
remove at the end on hover; an empty list is its name and an add icon.

**One frame in flight.** `useStageFrame` keeps at most one
`studio_component_frame` call running and, behind it, only the newest request,
so play and scrub skip the moments the renderer cannot keep up with and never
queue; the playhead ticks about 20 times a second. An edit to props, theme,
size or length waits 150 ms for the next one, a move of `t` does not. The
last frame that drew stays up (dimmed) when a request fails, with the
command's own sentence under it, and playing pauses so a failing frame is not
asked again every tick. Frames are not cached: each is an object URL, revoked
when the next lands.

**Source and Ask for a change** sit under the timeline. Source is a
folded row (`CollapsibleSection`, closed when the page opens) holding
`studio_component_source` in a read-only `CodeText`, with the level it came
from. Ask for a change, always shown, (`ChangeBox`) is Chat's `Composer`, `compact`, the
same bar as the subject Overview's ask bar
([harness.md](./harness.md#the-subject-overviews-ask-bar-starts-a-thread)):
its settings button names and changes the agent, model, level and mode,
and it takes `@` files, `/` skills (sent as the message's `skills`) and
dictation, with a draft per component (`new:studio-change:<name>`). It
sends the request to the agent through `useLibraryChange`, which sends with
Chat's `useThreadActions` under `useComposerSelection`: the first send of a
page session creates a Chat harness thread under the session's pick (its
`chatScope` is the library select's subject, or General), later sends
continue it under that thread's pick, and a different subject starts a new
one since a thread's subject is fixed at creation. A refused send gives the
words back with Rust's reason under the bar. On both the Components and Themes pages
the box is docked at the bottom of the page's scroller
(`components/ui/layout/StickyDock.tsx`, as the Overview's `AskDock`), so it
stays in view while the stage scrolls under its fade. The text is
`changeRequestText` (`lib/studio/changeRequest.ts`): a first line naming the
component and its level, the request, then the instruction to use the
oculus-studio skill, make a scratch video (`oculus studio new --scratch`,
which needs no narration), change the component in its
`components/` folder, check it with `gallery` and `promote` it to the same
level. The Themes page sends a theme's version of the same text. The thread is an ordinary one, so it shows in Chat ("Open thread"); its
sends carry `libraryChange`, so no scratch video is linked to it
([studio.md](./studio.md#a-video-has-a-thread)).
While its turn runs a line says what the agent is changing and a send is
handed back to the box with a note to wait; when
the turn ends the page reads the component's source and history again,
reloads the list (so props and examples follow the new text) and redraws
the stage. If a newer snapshot exists at that level the result says the change
was kept and **Undo** writes that snapshot back with
`studio_component_restore` (the text it replaces becomes the newest
snapshot; the page offers no redo). A change at
a level that had no file (a first subject version) has no snapshot to undo to
and says so; a turn that left the text alone says the thread shows why.

## The Themes page

`/studio/themes/:name` opens one theme of the browsed library (the same
library select and choice as the Components page); the bare route opens the
theme new videos there take. **New theme** in the header saves a copy of the
built-in `default` under a name asked for. Three columns:

- **The list** is every theme in effect for the library (`studio_themes`), a
  thumbnail each drawn in CSS from its tokens (`ThemeThumb`: the canvas, a
  heading in the heading font, the muted and accent colours, a surface card
  with its corner), so the open theme's thumbnail follows its unsaved draft.
  "Default" marks the theme a new video here takes
  (`studio_theme_defaults`' `effective`), and in a subject's library
  `LevelMark` says where each comes from.
- **The stage** (`ThemeEditor`): the name and where it lives, the actions,
  then the theme on a sample scene. The scene pills are starter components
  the library has and that load (Title, Graph, Diagram, Code, Chart, Table,
  Grid: `TitleCard`, `Axes`, `Graph`, `Code`, `Bars`, `Table`, `Grid`),
  each in its first example, drawn by `studio_component_frame` through
  `useStageFrame` (one in flight, edits wait 150 ms, as the playground) with
  the timeline to play or scrub its motion. Under it, the theme file in a
  folded Source row (the draft's text while there is one), and Ask for a
  change docked below.
- **The inspector** (`inspector/`, in `InspectorColumn` as on the Components
  page: the header's toggle folds it, the seam resizes it, both remembered
  under `oculus-studio-themes-inspector`) edits the draft in sections that
  fold (`oculus-studio-themes-sections`; Typography, Shape, Motion, Transition and
  Narration start folded). **Default for**: chips (Global, and the browsed
  subject) that make the theme that library's default or clear it
  (`studio_theme_set_default`, the library's `library.json`; a subject's own
  theme cannot be the global default); its header says which are on.
  **Colours**: every `color.*` token as a tile of a swatch, the name and the
  hex, two to a line, under a small heading for what it colours
  (`colorGroups` in `lib/studio/themeDraft.ts`, by name: Surfaces, Text,
  Accent, Ink, Status, Other); a tile opens the colour control. **Type**: the
  heading, body and code fonts (the families studio-core bundles) and each
  `type.*` font size. **Shape**: `radius.*`. **Motion**: the durations, the
  easings (four cubic-bezier numbers) and the spring presets (a preset
  choice, then its stiffness, damping and mass). **Transition**: the scene
  transition's kind, length and direction, then magic move, colour blend and
  motion blur. **Narration**: the lead, tail and pause. A section whose
  tokens the theme lacks is left out. There is no texture token. A new
  heading or body font also moves the `type.*` entries that used the old
  family (`setFontRole`, by entry name when two roles share one), since
  components spread `type.*`.

**Edits are a draft until saved.** Each edit replaces the draft
(`lib/studio/themeDraft.ts`, key order kept), and the stage draws it at once
by sending the draft's text as `themeText` in place of the saved theme. The
header then offers **Revert** and **Save**, which writes
`formatTheme(draft)` (two-space JSON) to the theme's own level with
`studio_theme_write`: a global theme browsed from a subject is saved for
every subject, and says so. The built-in `default` cannot change: its Save
is **Save as a copy**, which asks for a name. With no unsaved edit and a
snapshot at the theme's level, **Undo** writes the newest one back
(`studio_theme_restore`; that restore is itself snapshotted). **Duplicate**
saves the text (or the draft) under a new name in the browsed library and
opens it. In a subject's library **Own version** and **Remove own version**
work as on the Components page; **Delete** removes a library theme that
replaces nothing, after a confirm, its text kept in the history. Any write,
an agent's turn or a default change reloads the list, the defaults, the
source and the stage, and a new saved text replaces the draft.

**Ask for a change** is the playground's box over `useLibraryChange` with
the theme's level: the text names the theme's file in its library
(`../studio/library/themes/<name>.json` or the subject's), and tells the
agent to change a copy in a scratch video, check it with `gallery --theme`
and promote it back, so the old text is kept for Undo. In the dock, a
line takes the box's place for the built-in theme (duplicate it first) and
while the draft has unsaved edits.

**The colour control** (`components/ui/color/`) is a round swatch and its
hex that opens a popover (`ColorField`; `ColorPopover` is the same popover
behind any face, as the inspector's tiles): a saturation and brightness pad,
a hue strip, an opacity strip and the hex text. It is pointer-driven (`useFractionDrag`
reports positions as fractions of the element's box, so page zoom does not
matter) and the arrow keys move each part. It holds the hue itself, so
dragging through grey keeps it, and hands back `#rrggbb`, or `#rrggbbaa`
when not opaque ([ui.md](./ui.md) on native colour inputs).

## Stills are shared and queued

`stillUrl` turns each still into an object URL, shared by every tile that
shows it, four at a time (each is a render in Rust) with the newest 300
kept. A key names what the picture is of, including the video's modified
time, so a changed video shows its new frame; a rejection is not cached.
