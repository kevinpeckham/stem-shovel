# The song page, and how it is being broken up

The song page (`src/routes/[account]/projects/[project]/[song]/+page.svelte`)
is the app's largest file: the header, the settings popover with its five
tabs, the player with its status line and stem actions, the Docs panel,
comments, chat, attachments, the uploads and downloads menu, and the
popovers and menus behind them. On 2026-10-30 it was 4,928 lines (the
script to line 2037, 86 `$state` variables, 74 functions), and Fallow
scored its template at cyclomatic 320 the day a parser-hiding expression
was replaced (FINDINGS.md). Kevin asked for it to be broken up with more
components and shared utilities; this is the plan and the record.

## The principle: extract by state ownership

A block leaves the page when it owns its state. Its state and the
functions that write it move into a class in `src/lib/state/` (a
`.svelte.ts` module with `$state` fields, constructed by the page with
functions for anything reactive, since SvelteKit reuses the page component
between songs), and its markup moves into a component in
`src/lib/components/` that takes the instance as a prop. The page keeps
the layout, the data and the plumbing between panels. The pattern comes
from the stem player's `audio/deviceKeep.svelte.ts` +
`components/KeepOnDevice.svelte` (docs/stem-engine.md "Kept on this
device"). Props down, callbacks up, no shared module state, no new
`$effect`, a test beside every class and component, a screenshot of the
block before and after, and the Fallow health baseline
(`.fallow-health-baseline.json`, scoped to the page) re-saved after each
step so it shrinks with the page and still fails on anything new.

## Steps

1. **Tempo & key tab** (2026-10-30, done): the page lost 842 lines.
   - `state/songChanges.svelte.ts`, `SongChanges`: the tempo, key and
     meter change rows (`rows`, `error`, `saving`; `editPos`,
     `rowSeconds`, `positionMessage`, `reset`, `add`, `remove`, `save`,
     the readout `mode`; `POSITION_PLACEHOLDER`). The Sections tab, the
     start and end markers, comments and menus read positions through it.
   - `state/songChordDraft.svelte.ts`, `SongChordDraft`: Detect chords,
     the AI chord check and the chart draft (`chordBusy`, `chordSegments`,
     `chordBars`, `chordsChecked`, `chordError`, `draft`, `draftBusy`;
     `detectChords`, `draftFromPanel`, `draftFromChords`, `cancelDraft`,
     `dismiss`), with the run token and `DraftCancelled` inside. The Docs
     panel's draft card reads the same instance.
   - `state/songCheck.svelte.ts`, `SongCheck`: Scan stems, Ask AI to
     check with the chart alignment, Use these, Replace, and the
     uploader's detection (`applyDetection`), which share helpers.
   - `components/SongTempoKeyTab.svelte`: the tab's markup, verbatim, in
     six snippets Fallow scores apart; the page passes its `draftCard`
     snippet in so the Docs panel and the tab share one card.
2. **Sections tab**, then **Details**, **Demos** and **Options**: the
   same shape, one tab a step.
3. **The uploads and downloads menu** (the `actionButtons` snippet).
4. **Comments**: the popover, the two cards and the ⌘-click menus.
5. Then the page is the layout, the floating panels and the data.

## Effect on the client, as a pilot

The repo uses Effect 4 on the server (docs/effect-adoption.md), where it
earned its keep, and kept it off the client for bundle cost and shape.
Kevin asked (2026-10-30) that it be considered where appropriate here
too. The one client shape that fits is `SongChordDraft`: a pipeline
(transcribe → match → AI check → draft) with hand-rolled cancellation
tokens, beside the song check's 409 retry loop and the alignment's 90 s
timeout. The pilot (2026-10-30) swapped those for Effect's interruption
and `ensuring` in that class alone: it worked, the tests passed unchanged,
and the built song page node went from 57.0 to 68.6 kB gzip (+20%),
inlined into that page only. Reverted as not worth the cost for six
checks (docs/effect-adoption.md "Decision record"); its two behavior
tests stay. Pure extractions never carry a new runtime, so their diffs
stay reviewable.
