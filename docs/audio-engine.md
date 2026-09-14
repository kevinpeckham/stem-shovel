# Audio engine

`src/lib/audio/engine.svelte.ts` — `StemEngine`: one `AudioContext` at
32 kHz, one `GainNode` per stem, every source scheduled against the same
clock timestamp on play, so sync is sample-accurate by construction. Public
fields are `$state`, so components read `engine.position` directly.

- **Progressive load.** `load()` seeds `engine.stems` from the manifest
  (duration, channels and peaks recorded at upload travel with each stem)
  and fills each entry in as its file decodes. Rows and waveforms render at
  once, dimmed and labelled "decoding…"; play and seek enable when every stem
  is ready — a partial mix is not the song.
- **Loading is three stems at a time** (`LOAD_CONCURRENCY`): fetch and decode
  overlap; more in flight only raises peak memory. The manifest URL is the
  AAC playback rendition when one exists (docs/uploads-and-blob.md), which
  on a 50 Mbps connection took a six-stem song from 68 s to 9 s.
- **Memory is the binding limit**: ~128 KB per second per channel at the
  32 kHz context, so a 4-minute stereo stem is ~60 MB decoded. Songs are
  capped at `MAX_STEMS_PER_SONG` (32) stems, enforced when a stem is
  reserved. Blob serves files with a 30-day cache header, so repeat loads
  are decode time, not download time.
- **Dual-mono files collapse to one channel** after decoding
  (`lib/audio/mono.ts`): if every L/R sample pair is within 1e-3, the stereo
  buffer is replaced by a mono one; real stereo is untouched.
- **Sections timeline** (`SectionTimeline.svelte`): when a song has
  sections (`song.sections`, `[{ name, start }]` in seconds), a row above
  the stems shows a block per section on the same grid as a stem row, so
  the blocks sit over the waveforms, labelled with the section's `index`
  (roman numerals by default, the name on hover — the column is narrow);
  the block containing `engine.position`
  is highlighted and clicking one seeks to its start. Members edit index,
  names and start positions (in any position format, see below) in song
  settings; the `saveSections` command sorts by start and refuses two at
  the same time.
- **Tempo, key and time signature** are timed changes on the song
  (`song.changes`, `[{ kind, start, value }]`, kind `tempo | key | meter`),
  edited in song settings as rows of time (`m:ss.s`), kind and value; the
  `saveChanges` command sorts them and refuses two of a kind at one time.
  The timeline row draws one lane per kind that actually changes
  (`timelineKinds`: more than one change, or one that starts after 0:00 —
  a single change at 0:00 is the song's fixed value and only the header
  shows it), a marker per change clipped at the next of its kind, and
  highlights and names what is in force at the playhead. The row shows
  only when a song has sections or such a lane.
- **Position formats** (`lib/utils/formatTimecode.ts`, `parseTimecode.ts`,
  `parseBarsText.ts`, `lib/audio/measures.ts`, `lib/audio/readout.svelte.ts`):
  the transport's readout shows timecode (Logic's `[hh:]mm:ss:ff.sub` at the
  song's frame rate, 80 subframes a frame) or bars (`45 | 1`). A song with a
  tempo and a time signature shows bars by default and timecode otherwise;
  clicking the readout switches and the choice is remembered per browser
  (`readoutMode()` resolves the automatic default). The same mode drives the
  tooltips and how section and change times display in settings, and the
  editors show full precision (`45 | 1 | 0.5`). When typing, timecode
  (three or four colon groups), bars (a `|`, spaces allowed, needs the
  grid) and plain digital time (`1:23.4`, `83`) are all accepted. Times
  are stored as seconds to a tenth of a millisecond, finer than a
  subframe; a row saved without editing its text keeps its exact seconds. Section tooltips give the span in
  bars when a grid exists ("8 bars 2 beats"). Tempo is beats per
  minute where a beat is the meter's bottom number, so 6/8 at 120 is 120
  eighths a minute; beats are integrated across tempo changes and the bar
  count restarts at each meter change. `song.startAt` is where bar 1 begins
  (leading silence, a count-in — set it from the playhead in song settings)
  and `song.endAt` the song's end for the total; both draw as dashed lines
  on the timeline. Before the start the count runs through bar 0, -1, … as
  a DAW does.
- **MIDI view** (`lib/audio/midi.ts`, `MidiRoll.svelte`, `MidiBadge.svelte`):
  a stem with a MIDI file shows a "MIDI" chip beside its name; clicking it
  swaps the row's waveform for a piano roll of the file's notes on the
  song's time scale (same seek and keyboard behaviour), and back. The file
  is fetched from Blob and parsed in the browser once per URL — a small
  SMF reader that merges tracks, follows tempo changes and keeps note
  on/off only.
- **Comments** (`CommentTimeline.svelte`, `lib/remote/comments.remote.ts`):
  the documents panel has a Comments tab (scrollable list, newest last,
  author, date, an "edited" badge, the position as a link that seeks) and
  a + button opening one popover for posting and editing (title, text,
  position typed in any format and read against the song's grid on the
  server). Ctrl / ⌘-click or right-click on a waveform or MIDI roll opens a
  menu at the pointer with "Seek here" and "Comment here" (position
  prefilled). Located comments draw as icons on a row under the last stem,
  on the waveform column; clicking one opens a card anchored to it.
- **`mix()`** returns the audible mix (effective gain per stem with mute,
  solo and fader folded in, silent stems omitted, and master) for the
  server-side MP3 mixdown (docs/uploads-and-blob.md).
- **`remove(id)` and `relabel(id, label)`** let the player drop or rename a
  stem without re-decoding the rest. `StemPlayer` identifies what it has
  loaded by stem id + url: a refreshed load with the same stems relabels in
  place, a removal drops one stem, anything else is a full load.
- **Keyboard.** Space is the transport from anywhere except text entry
  (`$lib/keys.ts` decides what counts as text entry; the project playlist
  player uses the same rule; buttons activate with Enter); Home returns to the start; M / S toggle
  mute / solo for the focused row; arrows seek on a focused waveform.
- **Peaks**: `lib/audio/peaks.ts` reduces a buffer to 1024 max-abs bins; the
  same function runs in the browser after an upload and the result is stored
  on the stem row.
- The engine is loaded from an `$effect` with `untrack()`: `load()` reads
  the engine's own `$state` synchronously, and letting those become
  dependencies would re-run the effect mid-decode.
- The waveform canvas uses `{@attach}`; the attachment gets the 2D context
  once and a nested `$effect` redraws.
