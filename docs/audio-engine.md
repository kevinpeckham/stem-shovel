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
- **Tempo, key and time-signature detection** (`src/lib/audio/analysis.ts`):
  while stems upload, each decoded buffer yields an onset-strength envelope
  (spectral flux, 2048-point FFT, hop 256 = 125 fps) and two chroma
  profiles (8192-point FFT from 110 Hz to 4.2 kHz, and a 16384-point bass
  one from 55 to 260 Hz; spectral peaks only, each frame normalised, so
  drums do not smear them); the batch's features are summed and analysed
  as one mix: tempo by autocorrelation of the detrended envelope over
  50–210 bpm, candidates outside 80–170 held back (the half- or
  double-time lag often correlates as well as the beat; tuned on MMKK's
  real mixes) with a gentle log-normal around 120, refined by a parabola and then by
  the autocorrelation peak at 2, 4, 8, 16 and 32 beats (each pins the
  period to 1/k frame), which is what makes DAW tempos come back exactly;
  meter by comparing the raw envelope's autocorrelation at 3+6 beats
  against 4+8 (3/4 needs a 3 % win); key by correlating the chroma with
  the Krumhansl-Kessler major and minor profiles, the bass chroma deciding
  between a key and its fifth when they rank level. Measured on MMKK's
  mixes (2026-09-16): every declared tempo exact, four of five keys right
  (Mop Heart hears E where A is declared), the 3/4 song in 3/4. Only the first 90 s are
  analysed. The uploader hands the result to the song page: a song with
  no tempo/key/meter changes yet gets them at 0:00 and a long notice says
  so; one that has them only hears the detection. Tests use synthetic
  click tracks and chords. The synthetic test loop in `static/stems`
  (100 bpm, D) is detected exactly. **Scan stems** in the song's settings
  runs the same detector on `engine.buffers()` (nothing is fetched again):
  empty settings are filled at once, filled ones get a replace offer that
  keeps rows after 0:00.
- **Detect chords** (`src/lib/audio/transcribe.ts`, `src/lib/audio/chords.ts`):
  in song settings, once stems are decoded and the song has a tempo and a
  time signature. The stems weighted as tonal are summed, resampled to
  22050 Hz and transcribed to notes in the browser with Spotify's Basic
  Pitch (Apache 2.0; model files in `static/basic-pitch`, TensorFlow.js
  loaded on demand, pre-bundled in dev by `optimizeDeps`). Each bar's notes
  become a pitch-class profile (duration × loudness, the lowest note
  doubled as the likely root) matched against chord templates (major,
  minor, 7, maj7, m7, sus4, 7sus4, sus2, dim, aug, 5); a chord rooted on
  the bass gets a bonus, the previous bar's chord is kept when it fits
  nearly as well, and a bass outside the chord shows as a slash chord.
  Consecutive equal bars merge; the result shows as `| D | A | Bm | G |`
  lines. Tuned on Peaceful Dreams against its chart: the verse roots match
  bar for bar; the intro's D pedal still wanders. Takes a few minutes on a
  CPU-only browser, tens of seconds with WebGL.
- **Draft chart with AI** (`draftChartWithAi`, `draftChart` in
  songs.remote.ts): the transcribed notes per bar (`describeBars`: pitch,
  octave, seconds sounding, loudness), the template matcher's chords as a
  hint, the song's tempo/key/meter, its existing sections (as bars) and up
  to two of the account's own charts with their sections go to
  **`anthropic/claude-fable-5-1`** through the AI Gateway, which names the
  chord in every bar, the sections (index, name, start bar), a
  progression per section and a chart in markdown. A frontier text model
  reading the notes beat everything else on Peaceful Dreams' first 48
  bars (roots right: Fable over notes 43, template matcher 38, Gemini
  over notes 38, Gemini listening to the audio 23), and on the full song
  its verse, chorus and second verse match the band's chart bar for bar.
  About two minutes and ~100k tokens per song.
  "Save sections" writes them (bars → seconds on the grid; confirms when
  sections exist); "Save as chart" writes the chart document (confirms
  when one exists; `saveChartDraft`). Five drafts per user per hour;
  logged to `ai_request` as `chart-draft`. On Peaceful Dreams the draft
  kept the song's ten sections at their bars.
- **Ask AI to check** (`src/lib/server/aiDetect.ts`, `askAiAboutSong` in
  songs.remote.ts): a member sends the rendered original mix, with the
  song's current tempo, key and meter as candidates, to
  `google/gemini-3-flash` through the AI Gateway; the JSON answer (tempo or null for no
  fixed pulse, `tempoChanges` as `{at, bpm}` shifts, meter or "free", key,
  confidence, notes) shows under the changes editor with "Use
  these", which puts the values into rows at 0:00 for the user to save. Ten
  per user per hour; needs `AI_GATEWAY_API_KEY`, otherwise hidden. Every
  call is logged to `ai_request` (prompt text, reply, parsed answer or
  error, duration, tokens) and listed on `/admin` for review. First
  live run (2026-09-16, Peaceful Dreams): 145 bpm · D major · 4/4 at 95 %,
  in eight seconds, matching the song's settings.
- **Comments** (`CommentTimeline.svelte`, `lib/remote/comments.remote.ts`):
  the documents panel has a Comments tab (scrollable list, newest last,
  author, date, an "edited" badge, the position as a link that seeks) and
  a + button opening one popover for posting and editing (title, text,
  position typed in any format and read against the song's grid on the
  server). Ctrl / ⌘-click or right-click on a waveform or MIDI roll opens a
  menu at the pointer with "Seek here" and "Comment here" (position
  prefilled). Located comments draw as icons on a row under the last stem,
  on the waveform column, over the mix's waveform (`engine.mixPeaks`, the
  decoded stems summed by `computeMixPeaks`; `combinePeaks` stands in from
  the stored per-stem peaks until then); clicking one marks the point with
  a line and opens a card anchored to the icon. The row seeks like a stem.
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
