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
2. **Sections tab** (2026-10-30, done): the page lost 249 lines.
   - `state/songSections.svelte.ts`, `SongSections`: the section rows
     (`rows`, `error`, `saving`, `busy`, `answer`, `source`, the `words`
     getter; `reset`, `add`, `remove`, `detect`, `useAnswer`,
     `placeFromChart`, `save`), with the grid for snapping and
     `check.alignChart` passed in as functions and the position checks
     through `SongChanges`.
   - `components/SongSectionsTab.svelte`: the markup in three snippets
     (`actions`, `answerCard`, `rows`); its `link-dim` links became
     `link` (the shortcut is deprecated), the only markup change.
3. **Details tab** (2026-10-30, done): the page lost 334 lines.
   - `state/songDetails.svelte.ts`, `SongDetails`: the settings form's
     readers (`title`, `slug`, `description`, `writtenOn`, `version`,
     `frameRate`, `startAtText`, `endAtText`, `settingsDirty` as getters
     over `updateSong.fields`), the start/end entries and
     `positionError`, `preparePositions` (the seconds written into the
     hidden fields before submit), `reset` (`clearForm` plus the
     entries), and the credits (`creditDraft`, `creditBusy`,
     `addCredit`, `removeCredit`). The page read none of those outside
     the tab, so nothing on it points at the instance; `bump` (the
     stems-changed version offer) stays on the page.
   - `components/SongDetailsTab.svelte`: the form with its
     `updateSong.enhance` spread, in six snippets; the issue lists and
     the Start/End fields each became one parameterized snippet (Fallow
     flagged them as clones once they stood alone), `link-dim` → `link`.
4. **Demo uploads and the settings popover** (2026-10-30, done): the
   page lost 277 lines.
   - `state/demoUploads.svelte.ts`, `DemoUploads`: `jobs`, `notice`,
     `busy`, `upload(input)` with the format, size and room refusals in
     one module function; the Demos tab, the stem actions menu's Upload
     Demos, the notice line and the visibility refresh all read it.
   - `components/SongSettingsPopover.svelte`: the whole popover, its tab
     switcher (`SETTINGS_TABS` and the current tab now inside), the
     three extracted tabs, and the Demos and Options tabs' markup in
     snippets. The page keeps the gear button (`popovertarget`) and
     calls the exported `showTab(id)` through `bind:this` when the song
     check wants Tempo & key; the Details tab's save closes the popover
     from inside; the phone tab menu closes on its own
     `<svelte:window onpointerdown>`.
5. **The uploads and downloads menus** (2026-10-30, done): the page
   lost 354 lines.
   - `state/songDownloads.svelte.ts`, `SongDownloads`: `downloadAll`
     (`zipping`), `downloadMix` (`mixing`, `mixError`), `openInDawn`
     (`openingInDawn`), `saveMixAsDefault` (`savingMix`), the download
     `name` getter; the engine and the ready stems come in as functions.
     What the player or the mix list also writes (`mixBusy`, `mixDirty`,
     `fadersDirty`, `resetMix`) stays on the page and comes in as props
     or callbacks.
   - `components/SongActionsMenu.svelte`: the two `<details>` menus in
     two snippets, closing on an outside click through their own
     `<svelte:window onpointerdown>`; `uploadJobs`, `uploadNotice` and
     the `StemUploader` instance stay bound through the component
     (`bind:jobs`, `bind:notice`, `bind:uploader`) because the empty
     player's uploader shares them and the page renders the job list and
     Retry failed; `versionOffer`/`bump` stay with the page's
     stems-changed flow.
6. **Comments** (2026-10-30, done): the page lost 272 lines.
   - `state/songComments.svelte.ts`, `SongComments`: `draft`, `error`,
     `demoTarget`, `isAdmin`, `canEdit(c)`, `canDelete(c)`, `open`,
     `edit`, `editDemo`, `close`; the popover element is bound onto the
     instance (`bind:this={comments.panel}`), so `open()` shows it with
     no page plumbing. `locatedComments` stays on the page for the
     player's timeline.
   - `components/SongCommentPopover.svelte` (the form with its
     `.enhance`), `SongCommentCard.svelte` (one component for the
     timeline and demo cards, which differed only in how a position
     reads, where Go to seeks and which edit opens; the page keeps a
     one-line `card` snippet per list).
   - Moving the markup exposed three-way clones with the mix page and
     the Sessions page, so the shared parts became `CommentCard.svelte`,
     `CommentFields.svelte` and `CommentDeleteButton.svelte`, used by all
     three; the mix and Sessions pages lost their copies and their Go
     to, Edit and Delete links went from `link-dim` to `link`.
7. **The stem menu** (`stemMenuBody`), then the page is the layout, the floating panels and the data.

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
