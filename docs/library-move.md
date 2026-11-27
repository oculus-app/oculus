# The launch moves

Four one-shot moves bring an older data directory into the current layout
([architecture.md](./architecture.md#one-data-directory-resolved-without-a-tauri-handle)),
each run once at launch and a no-op after:

1. the app's own files move from the data dir's top into the state folder,
   `.oculus/` (`app/src-tauri/src/library/migrate/state/`);
2. a library written before the Drive tree (`LEGACY` in
   `app/src-tauri/src/library/layout/shape.rs`: synced folders at a subject's
   root, one folder per own kind, recordings in the data dir's
   `lectures/<media id>/`) moves into the current one
   ([architecture.md](./architecture.md#one-module-owns-every-path-shape-in-the-library)),
   by `app/src-tauri/src/library/migrate/`;
3. drawings named `.canvas` are renamed (`library/migrate/whiteboard/`);
4. files loose in `courses/`, beside the subject folders, move up to the data
   dir's top (`library/migrate/loose/`).

Nothing in the app reads an old layout afterwards; old paths stay readable
through `path_moves`.

## They run before anything touches the data dir

`library::at_launch` (`app/src-tauri/src/library/launch.rs`) is the one
sequence, in both processes, since they share `oculus.db` and the folders:
the state move, then Start over's cleanup
([auth.md](./auth.md#one-institution-profile-says-which-university)), then
the Drive move and the whiteboard rename, then the loose files' move. Last
it makes `courses/` if it is missing, so a new library's My Drive shows the
folder of subjects before the first sync.

- **The app** calls it first in `run()` (`app/src-tauri/src/lib.rs`), before
  the Tauri builder, so no window, database pool, job queue, watcher, media
  server or keyd call exists yet. A failure is kept until `setup`, which
  destroys the window before its page runs, says why in a dialog
  (`refuse_to_start`) and exits; the next launch starts or resumes the move.
- **The CLI** calls it in `main` right after its arguments parse, before
  every command with none exempt: `docs`, `keyd …` and `library migrate`
  would otherwise write into the state folder ahead of the move and take its
  rename targets. `--help`, `--version` and a mistyped command exit in the
  parse and touch nothing. A failure exits 1 with the message.

An exclusive lock, `.library-move/lock` (keyd-core's `flock`), keeps two
processes from moving at once: the second waits, then finds the markers.

## The app's own files move into the state folder

`library::migrate::state` moves a fixed list of names (`names.rs`), each to
the same name under `.oculus/`: the database and its write-ahead files, the
vault and its lock (and Windows' DPAPI key), `canvas-session/`, the sign-in
log and any session file an earlier version left, the five JSON records,
`models/`, `studio/`, `whiteboard-pages/` (and `canvas-pages/`, its name
before the whiteboard rename), `recovery/`, `downloads/`, `tmp/`, `agents/`,
and a pending `start-over` marker. Nothing is matched by pattern, so what the
app did not make stays at the top: `courses/`, the student's own folders and
files, a `lectures/` left from before the Drive tree, any other dot-folder.

`.library-move/done` says where a data dir stands: absent or `drive` (not
moved), `state-moving`, `state` (done). Once it says `state` a launch only
makes sure the state folder exists. Otherwise, in order:

1. **Plan** the renames from the names that are at the top. None there (a
   new install) writes the state folder, the guard and `state`, and returns.
2. **Refuse, having changed nothing**, before the lock is even taken:
   - a debug build that was not told to move (`OCULUS_STATE_MOVE=1`). Every
     checkout shares the one data folder, and a branch build must never move
     it; the dev preflight sets the variable in the main checkout only
     ([development.md](./development.md#a-debug-build-moves-a-library-only-when-told-to)).
     A release always moves;
   - a target that already exists under `.oculus/`: an error naming both
     paths. Nothing is ever merged or overwritten;
   - another process with the database open. `alone.rs` opens it with
     SQLite's exclusive locking mode, which fails while any other connection
     merely has a WAL database open, idle included (a write lock or a
     checkpoint would succeed against an idle app), then folds the
     write-ahead log in so one file moves.
3. **Write the guard** (`journal.rs`). The Drive move's own journal steps
   aside to `journal.drive.json` and its finished state to a marker of its
   own (`.library-move/drive`); this move's journal takes
   `.library-move/journal.json` with `"format": 2`; then `done` becomes
   `state-moving`. Every build since the Drive move reads `done` first and,
   when it is not `drive`, loads `journal.json` and refuses a format it does
   not know, before it plans, opens a database or shows a window. So from
   here an older build exits with "journal.json is from another version of
   Oculus (format 2)" instead of opening a fresh database over a library it
   cannot see. Neither file is ever removed; a new install gets them too.
4. **Stop the broker** (`broker.rs`): keyd reads the vault by path on every
   request and takes a missing file for an empty vault, and launchd's
   registration names the old socket, so the registration is removed (on
   Windows the resident broker is stopped) before the vault moves. A process
   that cannot do that (an agent's sandboxed CLI) stops here with "Open
   Oculus to finish the update".
5. **Rename** (`apply.rs`), `std::fs::rename` only, the database and the
   vault first: they cannot be rebuilt, so a later failure finds them in
   place. The journal is saved as each step lands. A source that is gone has
   moved already; a rename across volumes stops the move, and nothing is
   copied.
6. **Rewrite** (`after.rs`), each a no-op the second time: a `path_moves` row
   for each folder stored chats name (`agents`, `studio`,
   `whiteboard-pages`), the subjects' links (below), and the agent docs,
   skills and opencode's config written again where the workspace is now.
7. **Register the broker** at the new paths where the build ships one (a
   release's bundled helper; a debug build leaves it to the preflight's
   `keyd install`, which runs after this move), then remove the old install
   folder `bin/` and socket at the top, by name: `bin/` is not moved because
   the old registration names the program inside it.
8. Mark `done` as `state`.

A failure after the guard leaves `done` at `state-moving`: the error names
the journal, no build opens a fresh database, and the next launch resumes
from the journal. A debug build stops after N renames when
`OCULUS_STATE_MOVE_STOP_AFTER=N` is set, for checking a resume on a copy.

`oculus-keyd` guards its own side: while a vault is still at the data dir's
top and none is in the state folder, it refuses every op that needs the
vault ([architecture.md](./architecture.md#oculus-keyd-is-the-only-process-meant-to-read-its-key)).
keyd's paths are part of its source, so its ad-hoc signature changes with
them and macOS asks once for the "Oculus keys" keychain item.

### Each subject keeps its memories link and loses its root `AGENTS.md`

`agents::link_all` (`app/src-tauri/src/agents/links.rs`), which the move,
`oculus docs` and every sync run:

- re-points `courses/<code>/.oculus/agents/memories` at the workspace's
  bucket, `../../../../.oculus/agents/memories/<code>` (a junction with an
  absolute target on Windows);
- removes the `AGENTS.md` an earlier layout linked at the subject's root.
  Every thread starts in the workspace, where the one copy is, and no CLI
  loads the file from a subject's `.oculus/`, so it is not recreated. Only
  what the app made goes: the symlink to `../../agents/AGENTS.md`, or on
  Windows the copy whose `AGENTS.md.oculus-managed` marker still matches. A
  file or link of the student's there stays.

### What an older build and an older chat find

- A build that has the Drive move refuses on the guard, as above. One from
  before it has no launch move and would start a fresh database at the top:
  rebuild or remove such a binary before this build first runs.
- Saved chat sessions continue: Claude Code, Codex and Antigravity key a
  session by its id, not its folder. A provider that cannot load a saved
  session starts a fresh one with the conversation handed over
  ([harness.md](./harness.md)). The brief tells a resumed conversation where
  the folders its earlier turns named are now.
- Stored chat rows keep their text. The frontend reads both spellings of a
  state path (`app/src/lib/files/statePaths.ts`), and anything that asks
  `path_moves` follows the three rows above.

## The Drive move

A marker, `.library-move/drive` holding `done` (or `done` holding `drive`,
as a build from before the state folder left it), makes every later call a
no-op without opening anything. A data dir with no old folder (a new
library, or one written in the new tree) only gets the marker. Its journal
is `.library-move/journal.drive.json`.

### Plan, move, rewrite

1. **Plan** (`plan/`). Every step is decided before the first rename, from a
   walk of the folders and the database's rows, and written to the journal. Each step's source is where the thing is
   when that step runs. Names are chosen against the disk plus what earlier
   steps put there, compared as APFS and NTFS compare them: one Unicode form
   (NFC) and no case.
   - **Reserved names** first: anything at a subject's root named `Course` or
     `.oculus` in any case (the student's) becomes `Course (mine)` before
     anything moves in under that name. It gets no `path_moves` row, since
     its old path is the new tree's.
   - **Debris** first: `.claude/` agent scratch and the hidden
     `-staging-`/`-quality-` folders an interrupted parse left, under
     `courses/` and `lectures/`, deleted when they hold no file.
   - **Synced** folders into `Course/` (`files` → `Course/Files`, `ed` →
     `Course/Discussion`, …; `layout::legacy_folder_moves`), and `home.md`,
     `syllabus.md`. Videos the database knows in the old `files/` (module
     videos, page-embed downloads) go to `Course/Media/` with their
     `<stem>.vtt` and `<name>.vtt` captions.
   - **Own** folders (`uploads`, `documents`, `canvases`, `notebooks`)
     flatten into the subject's root, keeping everything below them. A file
     travels with what its parse made of it, so a clash renames them together
     (`a.pdf` → `a (2).pdf` with `a (2).md`, `a (2)_images/` and its records).
     An entry named `Course` or `.oculus` becomes `Course (mine)`. The notes'
     `assets/` becomes `.assets/` at every depth.
   - **Parse records** (`<stem>.pages.json`, `<stem>.emb.json`) go to
     `.oculus/derived/<the PDF's folder>/` (`layout::derived`); the parsed
     `.md`, `<stem>_images/` and a converted `<name>.docx.pdf` stay beside
     their source.
   - **The agent folder**: the `memories` link is dropped and remade at its
     new depth, `INSTRUCTIONS.md` and dot-entries go to `.oculus/agents/`,
     anything an agent wrote there for the student goes to the subject's
     `Agent notes/`, where it stays in sight.
   - **Recordings**: each `lectures/<id>/` with something in it becomes
     `Course/Recordings/<date>-<slug>/`, named by `layout::new_recording_rel`
     as a new download would be. `raw*.mp4` partials are deleted; a folder
     left empty is removed and its lecture keeps no `folder_rel`.
   - Loose files at `courses/` itself and folders with no lecture row stay,
     logged once.
   - **Rows that would meet**: a `files` row whose file is gone can map onto
     the path a file from another folder lands on (a stale `documents/a.pdf`
     and a real `uploads/a.pdf` both flatten to `a.pdf`). The row with its
     file keeps the path; the stale one gets `a (2).pdf`. Should a clash still
     reach the database, that row keeps its old path and is logged, rather
     than fail the transaction on every launch.
   - A `lectures/` that is a symlink is refused with a message: the student
     puts the folder back in the data dir, since the move only renames inside
     it.
2. **Move** (`apply.rs`) with `std::fs::rename` only. Each step's index is
   appended to `.library-move/done.log` as it lands; a crash resumes from the
   journal, and a rename whose source is gone and target present counts as
   landed. A rename across volumes stops the move with a message: nothing is
   ever copied.
3. **Rewrite the database** (`db/`) in one transaction, after the schema is
   brought up with the app's own migration list (the plugin's conversion, so
   the frontend's `Database.load` finds nothing to do). Rows are UPDATEd,
   never deleted and re-inserted, so `pages`, versions and task links stay on
   their `files` row: `files.relative_path`, `category` (`category_of`; a
   drawing's `canvas` stays for the whiteboard rename, which reads it to
   find a drawing whose file is gone) and a renamed `filename`; `sync_run_files`, `echo_embeds`, `inbox_item_entries`,
   `revision_notes.source_ref`; every path string inside `chat_proposals`
   and `agent_changes` JSON; `lectures.folder_rel` and its media paths; the
   links in a moved note's `document_versions`. The `library_layout` setting
   is written in the same transaction, so a resumed run never applies it
   twice.
4. **Rewrite files** (`contents.rs`, `links.rs`): every moved markdown file's
   relative links, the `asset://` picture links notes hold, a renamed PDF's
   records, the notebooks' `pages.json`
   (under the state folder's `canvas-pages/` or `whiteboard-pages/`), the subjects' memories links, and the workspace's `opencode.json` when
   opencode has been used. Each is a no-op the second time.

### Stored paths are recognised, never followed

`lectures.video_path`, `video2_path` and `transcript_path` are absolute
paths into wherever the library was when they were written. The move
computes every lecture move from `<data dir>/lectures/<id>/` and rewrites a
stored path by its `…/lectures/<id>/<file>` tail, joined to this data dir
(`db/rewrite.rs`, `lecture_path`). An `asset://` link in a note is read the
same way, by its `courses/…` tail.

### Links follow what they named before the move

A relative link is read from the file's old place and followed through the
rules; when that target is not what the link names from the file's new place
(in exact case: a case-insensitive volume would find `files/` for `Files/`),
it is rewritten with `link_between`, the spelling the sync now writes. So a
note's link to a sibling renamed on a clash (`brief.pdf` → `brief (2).pdf`)
follows it, even though an uploaded `brief.pdf` now sits beside the note. A
target not on disk is followed only when a rule moved its folder (a page or a
video not fetched yet; a video lands in `Media/`). A re-pointed link names
nothing from the old place, so a second pass leaves it.

## Old paths resolve through `path_moves`

Migration 64 adds `path_moves(old_prefix, new_prefix)`, one row per rule the
plan made: a folder per old folder of each subject, one per recording, and one
per file that left its folder on its own (videos, parse records, renamed
files). The longest prefix a path starts with at a boundary (`/`, `#page=`,
`:L15`, `?`) wins and the rest carries over. `library::migrate::resolve_moved`
is the Rust reader; `app/src/lib/files/pathMoves.ts` the frontend's, used by
`openCitation` when a cited path has no row. Chat history (`harness_items`,
`agents/threads/`), undo snapshots and saved tabs keep their old text and are
resolved when read.

## Drawings named `.canvas`

Right after the Drive move and under its lock,
`library::migrate::whiteboard` renames every `.canvas` drawing among the
student's own files to `.whiteboard`, the state folder's `canvas-pages/` and
`recovery/canvases/` to their new names, and the rows, `path_moves`, page
manifests and the notes that link to a renamed drawing with them, with its own journal and marker (`.library-move/whiteboard`).
A rename's rules go through `record_moves` (`library/migrate/resolve.rs`):
the drawing's own rule, plus every old path the rules already kept resolve
to the drawing's old path, mapped straight to its new one, since a lookup
takes one step. An old path is derived only when the kept rules really send
it there, so a file renamed on a clash (`uploads/a.canvas` → `a (2).canvas`)
keeps its own rule rather than taking its folder's (`uploads` → the subject
root) to another drawing named `a`. Drive's reconcile records its renames
the same way. A drawing's row is found as the volume finds the file
(`name_key`: one Unicode form, no case), and a row spelled other than the
disk gets a rule for its own spelling too. A
`.canvas` drawing that reaches the library later (a backup, another Mac, an
agent) is renamed by Drive's reconcile and imports
([frontend.md](./frontend.md#own-files-written-outside-the-app-get-rows)), with
the same test and naming (`library/files/whiteboards/legacy.rs`).

## Files loose in `courses/`

`courses/` holds subject folders only, but an older library can have files
sitting directly in it, which no subject lists. Last at launch, under the
same lock and once the Drive move is done, `library::migrate::loose` moves
each regular file there (never a folder, a dot-name or a symlink) up to the
data dir's top, where the student's own files are listed and the top level's
reconcile gives them rows. A file goes with what parsing made of it
(`paths::artifact_slots`): an Office file's converted PDF and the text beside
it, its parse record and page vectors into the top level's
`.oculus/derived/`. It keeps its name unless something at the top holds it,
or a companion's name: then it takes Drive's next free name (`name (2).ext`,
`drive::ops::names::free_name_where`), its companions following; nothing is
ever overwritten. A companion that is a folder (a PDF's pictures) stays and is
logged. The plan, its done log and its marker are `.library-move/loose.json`,
`loose.log` and `loose`; each rename goes through the Drive move's `apply`,
so a crash resumes, and each old path the student could have cited gets a
`path_moves` rule through `record_moves`. A failure is logged, not fatal:
every step is a whole rename, so the library is consistent between any two,
and the next launch finishes.

## Running them by hand

`oculus library migrate --dry-run` prints the Drive move's plan, or the
journal a cut-short run left; `oculus library migrate` runs it. Like every
command, both run the state move first, which has no dry run. A debug build
stops the Drive move after N renames when `OCULUS_LIBRARY_MOVE_STOP_AFTER=N`
is set, for checking a resume on a copy of a library. Run any of it against a
copy only, with `HOME` pointed at it (`dirs::data_dir` reads `$HOME`): the
moves change the live library in place
([development.md](./development.md#a-debug-build-moves-a-library-only-when-told-to)).
