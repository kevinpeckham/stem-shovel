# Arrangements

Several sets of stems for one song: the song's own stems are its **Main**
arrangement, and a band adds **alternates**, each a different treatment
or one member's ideas for the others to consider. An alternate is
duplicated from an existing arrangement, then stems in it are muted,
deleted, replaced or added without touching the one it came from.
Asked for by users; designed with Kevin on 2026-11-11.

## The model

- **Main is the song.** A stem whose `arrangement_id` is null belongs to
  the song's main arrangement. Every song that existed before this is its
  own Main with nothing migrated, and everything the app derives from the
  stems (the rendered mix, the chord and beat reads, the transcription)
  stays on the song row for Main.
- **An alternate is a `song_arrangement` row** (migration 0121): a name,
  an order within the song, who made it. Its stems are ordinary stem rows
  of the same song carrying its id, so a fader, a pan, an order, a
  replacement or a delete on a stem is already per arrangement: each acts
  on one row.
- **A duplicate shares the files.** Copying an arrangement copies its
  stem rows, each pointing at the same blob, rendition and peaks. Nothing
  is uploaded and nothing is stored twice; a blob is deleted when the
  last row that names it goes. (Phase 2: the unique index on
  `stem.pathname` comes off, deletes check for other rows, and storage
  counts a file once.)
- **Every read says which stems it wants.** "The song's stems" in a
  query means Main: `mainStems` (`isNull(stem.arrangementId)`) in
  `src/lib/server/data.ts`. A read for housekeeping (storage, moving
  blobs, deleting a song) takes every row. A read by stem id needs no
  filter. A new query on `stem` picks one of the three on purpose.

## Phase 2, the server (2026-11-11)

- **Migration 0122**: `stem.pathname` is no longer unique, `stem.muted`
  (the default mix's saved mute), `song_arrangement.note`.
- **Data** (`src/lib/server/data.ts`, "arrangements"): `stemsOf(id)` is
  the condition for one arrangement's stems (`mainStems` for null);
  `listArrangements`, `createArrangement` (from Main, empty, or another
  alternate; at most `MAX_ARRANGEMENTS`, a name not "Main" and not
  taken), `updateArrangement`, `deleteArrangement`,
  `reorderArrangements`. `getSong`, `createStem`, `reorderStems` and
  `setDefaultMix` take an arrangement; the jobs and the derived reads
  stay on Main until phase 3.
- **A copy shares what is finished.** A copied stem takes the source's
  rendition only when it is ready and its MIDI only when it has landed;
  a rendition or MIDI still in flight belongs to the row that started
  it, and the copy renders its own.
- **Shared files.** `unsharedStemBlobs(urls)` answers which files no stem
  row names any more; a stem delete, a replacement, a MIDI change, a
  rendition re-render (`transcode.ts`) and an arrangement delete ask it
  before deleting a blob. `deleteBlobs` drops duplicate URLs, which
  covers the whole-song and whole-account deletes, and
  `relocateSongFiles` moves a shared file once. Storage and the stem
  count on the settings page count a file once (distinct pathname).
- **Mutes.** A muted stem is left out of the rendered original mix and of
  its key (`mixKeyOf`), on Main as well; a custom mix may still name one.
- **The page.** `?arrangement=<id>` on the song page serves that
  arrangement's stems (`song.arrangementId`, `song.arrangements`); an id
  the song does not have redirects to Main. Uploads take `arrangementId`
  in the reserve body. Remote functions: `arrangements.remote.ts`.

## Phase 2, the page (2026-11-11)

- **The switcher** (`ArrangementSwitcher.svelte`) sits at the top of the
  Stems view: a link per arrangement, Main first, the current one marked
  (`arrangementHref`), an alternate's note and creator under the row.
  Editors get "+" (`ArrangementNewPopover`: name, note, start from) and,
  on an alternate, a ⋯ menu to rename, duplicate or delete
  (`ArrangementRenamePopover`). A viewer sees the row only when the song
  has an alternate.
- **The row since 2026-11-13** (Kevin): a small "Arrangements" heading
  with the info tip beside it (`ArrangementTip`), and for an editor the
  arrangement shown is a split button, as the chord player's Arp is: its
  link, and a caret that opens its menu (Rename, Duplicate and Delete on
  an alternate; Duplicate on Main). The separate ⋯ is gone.
- **Switching** is a navigation to `?arrangement=<id>` that keeps the
  scroll position; the stems view is keyed on the arrangement, so the
  player is torn down and built again and nothing of the last one plays
  on.
- **What follows the arrangement on the page**: uploads and added stems
  (`arrangementId` in the reserve), reorder, the default mix with its
  mutes (the engine starts a saved-muted stem muted; Reset Mix returns to
  the saved mutes), the browser's own mix and "keep on this device"
  (keyed by song and arrangement), and the Custom Stem Mix download
  (`/api/songs/[id]/mix?arrangement=`, always rendered: the cached
  original is Main's).
- **Main only until phase 3**, disabled on an alternate with "Available
  on the Main arrangement" (`MAIN_ONLY`): the Original Stem Mix download,
  Draft chart with AI, Generate chart from the stems, Scan stems, Detect
  chords, Open stems in Dawn, and the detection that runs after an
  upload. Comments are still the song's.
- **Checked in a browser on dev** (2026-11-11): create from Main (five
  stems copied, no upload), remove a stem on the alternate (Main kept its
  five and the file), mute and save (stored on the alternate only, loaded
  muted), custom mix (200, the alternate's stems), rename, delete (back
  on Main, five stems, the shared file intact).

## Settings of its own (2026-11-12)

An alternate can count bars on its own tempo: "getting the tempo and
time signatures and the offset correct so the transport counter can use
beats and bars" (Kevin). Migration 0124 adds `changes`, `start_at` and
`end_at` to `song_arrangement`.

- **Inherit, then copy on write.** While an alternate's `changes` is
  null it uses the song's tempo, key and time signature changes, start
  of bar 1 and end. The first save of any of them on the alternate copies
  the song's current three values onto the arrangement row and applies
  the edit (`writeSongSettings` in data.ts); the song row is never
  touched, and the song's later changes no longer reach that alternate.
  "Use the song's settings" clears the three (`clearArrangementSettings`).
  Main's settings are the song's, as always.
- **Served in the song's place.** `getSong` puts the effective values
  (`utils/effectiveSongSettings.ts`) where the song's were, with
  `settingsOwn`, so the transport, the click, the timeline and every
  other reader of `data.song.changes` and `startAt` follow without
  knowing about arrangements. An alternate with its own settings is
  served `useChartTiming: false`: the chart's timing map was made for
  Main's recording.
- **Saves.** `saveChanges` and `useChartlessGrid` take the arrangement;
  an alternate's start and end have their own form
  (`saveArrangementSpan`, `ArrangementSpanForm` in the Tempo & key tab),
  since the song's details form also writes its title and address. A
  comment's position typed in bars is read on the arrangement's grid
  (`songGrid(songId, arrangementId)`).
- **Still the song's:** the chart, the lyrics and the sections. Sections
  are stored in seconds, so on an alternate at another tempo they sit at
  the same seconds and fall wherever those land on its grid. They move
  with the per-arrangement chart, later. The stems scan, chord detection
  and "Ask AI to check" stay Main only; an alternate's tempo is typed.

## Decisions (Kevin, 2026-11-11)

1. The chart, tempo, key and sections are the song's and shared by its
   arrangements in the first version.
2. Any editor may create an alternate; its creator is shown.
3. A comment belongs to the arrangement it was left on.
4. An alternate can be promoted to Main; the old Main becomes an
   alternate.
5. Set lists, share links and the project page play Main unless a link
   names an arrangement; the arrangement rides in the URL.
6. The name is "arrangement", though Dawn's timeline and a song stage use
   the word too.

## Phases

1. **The model, invisible** (this change): the table, the stem column,
   every read of a song's stems narrowed to Main. Nothing a user sees
   changes; there are no alternates yet.
2. **Alternates in the player**: the switcher, create and duplicate,
   mute, add, replace and delete per arrangement, an alternate's own
   rendered mix.
3. **The rest per arrangement**: chords, beats and generated charts,
   comments, promote to Main, downloads and share links that name one.
