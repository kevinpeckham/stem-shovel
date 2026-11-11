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
