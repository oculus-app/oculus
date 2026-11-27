---
name: oculus-studio
description: Makes a short explainer video in an Oculus library in the style of 3Blue1Brown, one question answered in 60 to 120 seconds over 2 to 4 scenes, by writing a spoken script and TSX scenes, then narrating, linting, checking a strip and rendering a draft mp4 with `oculus studio`. A request too big for one video becomes a series outline with part 1 made. Use for "make a video of lecture X", "an explainer of Y", "animate this proof", "make part 3", or any request whose result is a video.
---

# Videos

A video is a **folder** that `oculus studio` reads: `video.json` lists the
scenes, `components/` holds the TSX that draws them, and `script.md` holds
what is said. You write those files; the CLI narrates, checks, draws frames
and renders the mp4. You make the whole video yourself, start to finish.

The target is a 3Blue1Brown video, not a slide deck. The picture *is* the
explanation: a formula is written term by term as each term is said, then
rewrites itself into the next line in place; a finished result slides
aside to make room; a definition is shown working on a real example before
it is named. Nothing is asserted that the picture does not show.

## Contents

- One question, 60 to 120 seconds; a series when one is not enough
- The files beside this one; where things are
- Making a video: the checklist, then each step
- The plan: five lines, in the reply
- The script: how the references talk
- Close every gap: what a viewer who saw no lecture needs
- The picture: how the references draw
- Moving maths
- Writing a scene: components, cues, checking as text, looking
- Narration and pronunciation
- Keeping a component

## One question, 60 to 120 seconds

Every video answers **one question** in **60 to 120 seconds**, over **2 to
4 scenes** of at most 30 seconds each. Depth per scene is the point: a
scene is one picture taken through several big changes (written on,
rewritten, pointed at, set beside a wrong case), not a new layout per
sentence. Eight scenes of headings over cards read as a static slide deck;
three scenes that each carry one picture through five changes read as an
explanation.

The test: can the request be answered by one question a student would ask,
in two minutes, with one picture? "Why does binary search need only twenty
guesses for a million names?" passes. "Explain sorting algorithms" or "make
a video of lecture 11" does not: it holds several questions.

The viewer has watched no lecture. Explain every basic the one question
needs, on an example before its name (seven dots that refuse to make a
rectangle, then "prime"), inside the scenes you have. Closing a gap comes
before being short ("Close every gap"): take the seconds it needs, up to
lint's 4 narrated scenes and 150 seconds. When the basics alone need two
minutes, they are a part of their own.

## A series, when one video is not enough

A request that fails the one-question test gets the one video that matters
most, inside a **series**: an outline of at most 7 parts, each a question,
shown to the student in your reply. Then make **part 1 only**, and stop.
Your reply names part 2: the student makes it from its page in Studio, or
asks for it here and gets a subagent card (below).

```bash
oculus studio series new shor --title "How Shor breaks RSA" --subject MULT20015
oculus studio series add shor --title "Why factoring is hard" --question "Why can't a computer just try every divisor?"
oculus studio series add shor --title "A power that lands on 1" --question "How does a repeating power hand you the factors?"
oculus studio series show shor
oculus studio new why-factoring-is-hard --series shor --title "Why factoring is hard"
```

- `series new <slug> --title … [--subject …] [--theme …]` makes the
  outline; `series add <series> --title … --question … [--slug …] [--at
  <n>]` adds a part (at the end, or as part `n`); `series show <series>`
  lists each part's number, title, question, slug and whether it is made.
- `new <slug> --series <series> [--title …]` makes a part's folder with the
  series' theme and subject. It refuses a slug the outline does not list,
  so take the slug from `series show`.
- **Each part stands alone.** It opens with one line picking up the part
  before ("Last time, a power of two landed back on one. Here is why that
  breaks a lock."), and never relies on a picture the viewer must
  remember: draw it again.
- **Each part ends on the next.** After its payoff, one line asks the next
  part's question ("So the lock holds only while nobody can split n. Next:
  the pattern that splits it."), and your reply names that part. What a
  part raises and cannot explain is said to be the next part's question,
  never left on screen unexplained.
- **A later part is made in its own chat**, which has seen none of the
  others: the one its page in Studio opens, or a subagent's. When the
  request names a series and a part, run `oculus studio series recap
  <series> <part>` (its number or slug) before anything else: it prints
  the outline, this part's question, and the script of the part before,
  or one line saying it is not made yet or that this is the first part.
  Write the opening line picking up the part before from that script, or
  from its question in the outline when it has none.
- A component carried from one part to the next is copied into the new
  part's `components/` (or promoted to the subject library, "Keeping a
  component"); a part never reads another part's folder. `series recap` is
  the one way to learn what the part before said.
- When the brief names a series and its parts, "make part 3" means that
  part's slug: no searching.

**In a chat that already holds a series, a later part goes to a
subagent.** A chat keeps its first video, so a part made in this chat
would have no chat of its own: its card, progress and Open the chat would
stay on the first. Asked for a later part, do not make it here: propose a
`Subagent` card in an `openui` fence (`oculus-ui`, "Subagents") and stop.
The child sees nothing of this chat, and its first turn has no series in
its brief, so the task carries it all: the part and series by slug,
`series recap` first, `new --series`, the draft and never the final, and
the four lines this chat needs back (the part's slug, the draft's length,
what it covered, the question it ends on). Parts may be made at once, so
never promise the part before's script: `series recap` says whether there
is one. `then` names the next part. When this chat is itself a subagent's
(the brief says so), it cannot start one: say another part is made from
the series' own chat or that part's Studio page, and write no card.

```openui
root = Stack([Subagent("Part 2: A power that lands on 1", task, "Tell the student in two lines what part 2 covers and the question it ends on, then name part 3")])
task = "Use the oculus-studio skill. Make part 2 of the series `shor` (video `a-power-that-lands-on-1`). Run `oculus studio series recap shor 2` before anything else, then `oculus studio new a-power-that-lands-on-1 --series shor`. Make only this part and render its draft, never the final. End your reply with four lines: the part's slug, the draft's length, what it covered, and the question it ends on."
```

## The files beside this one

Both are in `skills/oculus-studio/` under your working directory.

- **`reference.md`**: the authoring rules (video.json, script.md, the
  component format, elements, the theme, motion, maths, moving maths with
  five whole components, cues, transitions, lint, the commands' output,
  slides, libraries). Read its "video.json" and "script.md" sections before
  writing those files, and "Components", "Maths", "Moving maths" and "Word
  cues" before your first component. Afterwards, go to the section a lint
  message or a question points at.
- **`studio.d.ts`**: every global's exact signature, for TSX. Search it for
  the name rather than reading it whole. A component imports nothing;
  every global it declares is simply there.

## Where things are

From your working directory (`.oculus/agents/`):

```
../studio/videos/<slug>/      one video
  video.json                  the scenes, in order
  script.md                   what is said, per scene
  components/<Name>.tsx       the video's components
  assets/                     images, named by <Image src>
  assets/slides/              made by `oculus studio slide`: page crops for Slide
  narration/                  made by narrate
  out/                        made by frame, strip and gallery: PNGs
  renders/                    made by render: draft.mp4
../studio/series/<slug>/      a series' outline (series.json): through `oculus studio series` only
../studio/library/            the global library: read, never edit (but library.json: reference.md, "Libraries")
../studio/subjects/<CODE>/    a subject's library: read, never edit (the same)
../studio/subjects/<CODE>/lexicon.json   pronunciations: never edit ("Narration and pronunciation")
```

Every `oculus studio` command takes the video's **slug** where its usage
says `DIR`. File tools need the folder: `oculus studio new` prints it.
For machine-readable output, add `--json`; `lint --json` prints `[]` when
clean. The Oculus chat instructions own shell restrictions.

## Making a video

Copy this checklist and tick it off as you go:

```
Video progress:
- [ ] 1. Scope: one question, 60-120 s, 2-4 scenes (or a series outline and part 1)
- [ ] 2. Name it and make the folder (oculus studio new --title)
- [ ] 3. Read the one slide page or transcript slice the idea lives in
- [ ] 4. Write the five-line plan in your reply, then carry straight on
- [ ] 5. Write script.md and video.json; gap pass; lint until only component_not_found and narration are left; narrate
- [ ] 6. Write each scene's components; lint --scene and beats --scene until clean
- [ ] 7. Lint the whole video until no errors; one strip of the whole video; fix what it shows
- [ ] 8. Render the draft and give the student its path
```

**Step 2.** Run `oculus studio new` only when the student's request is for
a video. Selecting this skill while asking about themes, components or
Studio is not itself a request to create one. If the brief already has
"The video being made", use that folder and skip creation. Otherwise name
the video: a title a student would search for, the question or idea in
their words ("Why binary search needs twenty guesses", not "Lecture 11
video"). Name what the viewer gets, not a fact on the way to it: "How a
repeating power factors fifteen", not "Why two to the fourth is one mod
fifteen". The title is set as plain text on the title card and in the app,
so write it in words, with no formula: "The staircase that adds up one to
n", not "Why 1 + 2 + ... + n is n(n+1)/2". Derive the slug from it
(lowercase letters, digits, `-`) and run:

```bash
oculus studio new binary-search-twenty-guesses --subject COMP10002 --title "Why binary search needs twenty guesses"
```

The title is the video's name in the Videos grid and the chat, and the
title card's text. `oculus studio title <slug> "<title>"` renames it later;
the slug never changes. `new` refuses a slug that exists (`oculus studio
list` shows them). `--theme NAME` selects the requested theme; without it
the subject's default is used. Pass the theme and format from the message's
Video style context when provided. `--portrait` is for Reels or a requested
vertical video. The command refuses when narration has no configured voice;
ask the student to fix Settings → Studio → Narration. A scratch video made
only to check a component or theme takes `--scratch`: it is never
narrated, so it needs no voice, and it is not the conversation's video. It
writes one silent `TitleCard` scene; keep or replace it.

**Step 3.** Read the source directly, and only the part the idea lives in.
`oculus list -l CODE` finds the recording; the slide-change lines of its
`outline.md` (the `oculus-lectures` skill says how) find the minutes;
`oculus files CODE -t pdf` finds the deck. Read that one slide page or
transcript slice in full, and copy its numbers and examples exactly. When
the source stops short, say so in the narration ("the lecture leaves how
the period is found for next week") rather than invent the step.

**Step 5.** `video.json`: one scene per beat of the plan, each with its
`id`, its component name, and `"props": { "narrated": true }` on a
narrated scene (`{}` and a `hold` on a silent one). `script.md`: each
scene's narration in spoken form, with pauses ("The script" below and
`reference.md` "script.md"). Do the gap pass ("Close every gap") on the
script before narrating, since a sentence added later means narrating
again. Then:

```bash
oculus studio lint binary-search-twenty-guesses
oculus studio narrate binary-search-twenty-guesses
```

Before the components exist, lint reports a `component_not_found` error
for each scene and a `narration` error for each narrated one; fix every
other error, above all `script`, then narrate. Lint prints at most 15
lines, errors first, then a count of what it left out; fix those and lint
again.

**Steps 6 and 7** are "Writing a scene". **Step 8:**

```bash
oculus studio render binary-search-twenty-guesses
```

writes a fast 540p `renders/draft.mp4` and prints its path. Tell the
student the path: the app plays the draft in the conversation. The draft is the hand-back. A
full-size final is the student's to make with Export on the video's page;
never render one yourself.

## The plan

Before writing any file, put this in your reply, five lines, and then carry
straight on building. It is not a question: do not wait for a go-ahead.

```
Question: Why does binary search find one name in a million with twenty guesses?
Hook: Checking names one by one could take a million looks; you will need twenty.
Picture: one long bar of a million sorted names, filling the frame, that halves with each guess.
Beats: guess the middle and half the bar goes grey → twenty halvings take a million to one → beside it, the one-by-one scan has barely moved.
Payoff: each guess halves what is left, so doubling the list costs one more guess.
```

- **Question**: the one the video answers, asked in the first scene and
  answered in the last.
- **Hook**: the obvious answer that fails, or a concrete scenario the
  viewer can see themselves in. It says why the viewer wants the answer
  before any fact that leads to it.
- **Picture**: the one object everything happens to. Every scene changes
  it; none replaces it with a slide.
- **Beats**: three, each a big change to the picture. Two to four scenes
  carry them.
- **Payoff**: the answer in one sentence, shown in the last frame.

## The script

How the reference videos talk (3Blue1Brown, StatQuest, Kurzgesagt,
minutephysics, Khan Academy, Primer, Reducible, Welch Labs, Freya Holmér),
measured against Studio's own:

- **Talk to "you".** The references use "you", "we" or "I" 4.4 to 8.2
  times per 100 words; textbook narration manages 1.8 to 2.4. "You have a
  million names" beats "Consider a list of a million names".
- **Point at the picture.** "This", "here", "watch", "look": 1.8 to 4.4
  per 100 words in the references, 0.5 to 1.3 in ours. Each one is a beat:
  something on screen moves or lights up as it is said.
- **Open on the question, never an agenda.** Not "In this video we will
  build up three tools: halving, logarithms and a bound." Instead: "A
  million names, sorted. How few guesses find one?"
- **Short sentences.** The voice says each sentence in one go; split one
  with two clauses of maths.
- **Every number given meaning.** "A 768-bit key" says nothing; "a 768-bit
  key, a number about two hundred and thirty digits long" does.
- **`[pause]` where an idea lands**: after a result is shown, a definition
  is complete or a rewrite finishes, and at the end of the last scene.
  Two to four a scene, never after every sentence. A pause is silent and
  the picture holds through it.
- **`[breath 0.25]` wherever a reader would breathe.** Left alone the
  voice runs most commas together, so mark the silence after a word:
  about 0.3 s at a clause's comma, 0.15 in a list, 0.4 at a colon, 0.5 to
  0.8 at a sentence's end, and 0.3 before the word a sentence was building
  to, comma or not. About one mark every four to six words; `reference.md`
  ("script.md") has the table. The picture does not wait on a breath.
- **`[word](reading)` on a word with two readings.** "The table records"
  and "the records" are spelt alike and said differently, and the voice
  picks by the neighbouring words: about one in fifteen comes out wrong.
  Say which is meant: `[records](verb)`, `in [use](noun)`, `it
  [lives](verb) here`, and `[a](letter)` for a variable named a. Only the
  voice gets the reading; captions and `word()` keep the word as written.
  Never respell a word in the prose to fix how it sounds: the respelling
  would show in the captions.
- **Explain, don't assert.** Every claim gets its reason, shown. Example
  first, then the rule in one sentence, so the example is not a trick.
- **Link each scene to the last** with an opening clause that picks up
  what was just shown, and **end on the opening question**.
- **Say it the way the voice will run it.** Speech is one stream, so words
  fuse: "R S A rests" is heard as "RS arrests". A letter said alone ("q")
  may be timed as a word ("cue"), so cue the word beside it. `reference.md`
  ("script.md") has the spoken-form table and the acronym rule.

## Close every gap

The viewer has watched no lecture and cannot ask you anything. Each thing
left unexplained ("where did that 5 come from?") stays in their head while
the video moves on, and that is where they stop following. So a video
raises only what it answers, and answers everything it raises.

- **Motive before fact.** Say what the viewer gets, and why they want it,
  before the fact that delivers it. "Two to the fourth leaves one over" is
  a fact; "that leftover one hands you fifteen's factors" is the reason to
  watch, so it comes first, in the title and the opening sentence.
- **Every symbol and number has an origin, said and shown.** A 5 in a
  formula that is the public key's `e = 5` travels there from it (the
  "value put into a formula" row of "Moving maths"), or keeps its letter
  and colour. A value somebody chose says who chose it and by what rule
  ("e can be any number that shares no factor with seventy-two; here it is
  five").
- **A term on screen or in the script is defined first.** "91 splits in 4
  tries" assumes the viewer knows what splitting is; "7 divides 91
  exactly, on the fourth try" assumes nothing.
- **A colour that means something is named at its first use** ("red: it
  leaves a remainder; green: it divides exactly"), by a word, a label or
  a mark, and means that for the whole video and series.
- **A result lands on its name.** The 7 the trial divisions find is q: it
  moves onto `q = 7`, so the viewer sees which earlier thing was just
  found.
- **Return to the claim.** When a worked check confirms an equation shown
  earlier (`5 × 29 = 145 = 2 × 72 + 1` for `5 × d ≡ 1 (mod 72)`), its last
  step rewrites into that equation with the unknown filled in
  (`5 × 29 ≡ 1 (mod 72)`), so the viewer sees it hold.
- **Introduce nothing you will not explain.** A step, symbol or name the
  video has no room for stays off the screen and out of the script. A
  closing chain `n → p, q → φ(n) → d` whose last two arrows the narration
  never says is new material in the final seconds: show the part the words
  cover, or say each arrow while pointing back at the numbers that walked
  it. In a series, what is left over is the next part's question, said in
  the last line.

**The gap pass.** Before narrating, read the script and the plan's picture
as someone who has watched no lecture. For each symbol, number, colour and
label that will be on screen, and each term said, find the sentence that
says where it comes from. Where there is none, add the sentence and its
beat, or cut the thing. A gap costs a sentence: pay it, within lint's
`long_scene` and `long_video`.

## The picture

The references draw on 11 to 31% of the frame and change the whole frame
1.8 to 25 times a minute; Studio's videos drew on 4 to 6% and changed it
0.2 to 1.2 times. Size and big steps are the gap, not constant motion.

- **One large object fills the frame** and changes in big steps: it
  regroups, rewrites, splits, is compared. Lint's `sparse` fails a frame
  whose content fits in under 60% of its width or 50% of its height.
- **A hold is fine.** 3Blue1Brown is still about half the time: while the
  words explain what is shown, let it sit. Never add a pop-in only to
  break a hold.
- **No title over a scene.** Lint's `scene_title` fails one; say the idea
  instead and let the picture's own labels name what it shows.
- **Labels of a few words**, set with a `type` token, all 40 px or more on
  the 1080p frame (lint's `small_text`): the chat player is about 600 px
  wide. Never put the script on screen.
- **Show the wrong case beside the right one**: the scan that crawls beside
  the search that halves, the dot left over beside the rectangle that
  closes.
- **Real figures.** When the lecture's own figure is the point (the
  diagram the student will meet in the exam, a plot of real data), show
  the crop with `Slide` (`reference.md`, "Slides"); redraw it as a
  component when the scene must move its parts.
- **No colour, font or spacing literals.** Read them from `theme`
  (`reference.md`, "The theme").

**Banned**, because each is a slide, not an explanation:

- a chain of cards joined by arrows (draw the thing itself: the dots, the
  bar, the clock, the graph);
- a heading with lines of text appearing under it;
- a formula that appears whole;
- a scene that shows only text;
- a number on screen that no picture explains.

## Moving maths

Every formula, number in a formula and variable on screen is a
`<Math tex="…" key="eq">`: LaTeX typeset as one keyed glyph per piece, so
it can be written on and rewritten term by term. It moves as it is said:

| The narration says | On screen | Built with |
| --- | --- | --- |
| a formula, term by term | each term is written on as its words are said | `<Write at={{ lhs: word("…"), … }}>` round the Math, one `\k{name}{…}` group per spoken term |
| the next step | the line rewrites itself in place: shared terms glide, what cancels fades, what is new arrives beside its neighbours | `<Steps at={[word("…"), …]} lag={0.1}>`, one state per line, the same Math `key` in every state, `\k` names on the terms that must travel |
| "this term", "the period" | the term is pointed at as it is named | `Brace` with a label, `Surround`, `Underline`, `Indicate`, `Arrow from to`, each on `target="eq/name"` |
| "keep that", then the next idea | the finished result shrinks into a corner and stays there while it is used | a later Steps state: the same Math key, smaller, `position: "absolute"`, no `lag` |
| a value put into a formula | the number flies into the symbol's slot; the symbol fades | one Math holding the formula and the given, the number `\k{val}{…}` in both states |
| the next scene uses it | it carries over term by term | the same Math `key` in the next scene's tree, and no `transition` on that scene |

`reference.md` "Maths" has the element (props, backslashes, `\k` keys,
theme colours, size) and "Moving maths" a working component for each row.
They show the mechanisms, not layouts to copy: the picture is yours.

**Never:**

- a formula that appears whole: every Math is inside a `Write` cued to its
  words, or arrives as a Steps state on its cue;
- lines stacking under each other: a derivation is one place, rewritten;
- text pretending to be maths: `2^{4}` or `7 = 1 × 7` as Text, a power
  as a raised Text run. Words that belong in a formula are `\text{…}`
  inside its Math.

## Writing a scene

**Start each scene with its brief.** `oculus studio brief <slug> --scene
<id>` prints the scene's index, component and props, the scenes either
side, each narration sentence with the time `word()` returns for its words
and the time `pause()` returns for each pause, and the exact `lint`,
`beats`, `strip`, `frame` and `gallery` calls for the scene. Use it instead
of reading the narration manifest. If it prints a narration error instead
of word times, narrate first.

**Write.**

1. Write the scene's components in `components/`, named after what they
   draw (`HalvingBar`). Write your own freely: the library's components
   are primitives to compose (an axis, a graph, a grid), never templates
   to fill, and nothing needs to be reused. Two scenes share a component
   only when they show the same picture carried on. A component made for
   one scene declares one prop, `narrated: bool().default(false)`:
   `video.json` sets it `true`, so the beats cue on `word()`, and without
   it they fall back to fixed times (every recipe in `reference.md`
   "Moving maths" shows the pattern).
2. Cue every beat with `word("…")` on the words that say it, spelled as the
   brief prints them. The first element is on screen at a fixed time under
   half a second, so the scene never opens on an empty frame.
3. A pause is where an idea lands. Time the landing (the rewrite's last
   state, the highlight, the value in its slot) to settle just before
   `pause()`, then start no new motion until the next word.
4. An element that carries into the next scene keeps its `key` in both,
   and the next scene sets no `transition`, so it moves instead of fading.
5. With `"captions": true` in video.json the captions take the bottom sixth
   of the frame: keep key content above it.

**Check as text** before looking, with the brief's two calls:

- `lint … --scene <N>`: fix every error. Fix each warning, or know why the
  scene wants it. `reference.md` ("Lint") has each kind and what to do.
- `beats … --scene <N>`: what changes on screen, when, and the words said
  then, at most 20 lines. Check each beat lands on its words, then run it
  with `--key <key>` for each key you just changed.

**Look** once the whole video lints clean: one strip of the whole video,
about one frame every four seconds.

```bash
oculus studio strip binary-search-twenty-guesses --n 24 --cols 4
```

On Claude Code, **Read the PNG in the same message as the command**, the
command first: it runs a message's calls in order. Elsewhere, Read it in
the next call. Check that the picture is large and centred, that each
scene shows the plan's change, and that each shared key moves from one
scene into the next. Look again (a `frame` at a beat's time, or a scene's
`strip`) only after a fix the strip asked for.

## Narration and pronunciation

`narrate` reads Settings → Studio → Narration; pass no `--engine`,
`--server`, `--model` or `--voice` unless the student asks. If it fails for
want of a server, model, voice or the word-timing model, **stop and tell
the student** what to set in Settings → Studio (Narration, or Word timing
for the aligner). If they ask to download missing packs, propose
Download("aligner") or Download("voices") in an `openui` fence using
`oculus-plan` / `oculus-ui`; the card shows the size and the student
confirms. If the server does not answer, say so; do not retry in a loop.

**Check the guessed words.** With the Kokoro engine, narrate ends with a
`note: … check pronunciation: "Nesterov" is guessed as /nˈɛstəɹɔv/` line
for each word its dictionary lacks. The student, not you, decides how a
word is said: never edit a `lexicon.json`. Judge each guess from its
phonemes; for a doubtful one only, suggest a reading with `oculus studio
pronounce suggest <slug> Nesterov NESS-ter-off` (`reference.md`,
"Pronunciation", has the rules), tell the student which words you
suggested, and that they decide in Settings → Studio → Pronunciation. Do
not wait: carry on with the video. A suggestion marked wrong comes back in
the notes with the student's note; suggest again following it.

**Check the words with two readings.** Narrate also ends with a `note: …
check reading: "use" is read /jˈuz/ here; if that is the wrong one, write
`[use](noun)` for /jˈus/ in script.md` line for each unmarked word the
dictionary reads more than one way. This one is yours to settle, not the
student's: the sentence says which word is meant. Read each note against
its sentence, write the mark it gives where the wrong reading was picked,
and narrate again; only that scene is remade. A word that was read right
needs no mark, and its note stays.

A lint problem naming `lexicon.json` is an entry that does not parse: tell
the student, who fixes it; never edit it yourself.

## Keeping a component

**Never edit a library file directly.** A component or theme reaches a
library only through `oculus studio components promote` or `oculus studio
themes promote`, which keep the old text in `.history/`. Promote only when
the student wants it kept for other videos, or to carry a component
through a series:

```bash
oculus studio components promote binary-search-twenty-guesses HalvingBar --to subject
```
