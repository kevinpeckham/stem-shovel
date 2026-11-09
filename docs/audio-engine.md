# Audio engine

`src/lib/audio/engine.svelte.ts` — `StemEngine`: one `AudioContext` at
32 kHz, one `GainNode` per stem, every source scheduled against the same
clock timestamp on play, so sync is sample-accurate by construction. Public
fields are `$state`, so components read `engine.position` directly.

- **Progressive load.** `load()` seeds `engine.stems` from the manifest
  (duration, channels and peaks recorded at upload travel with each stem)
  and fills each entry in as its file decodes. Rows and waveforms render at
  once, dimmed and labeled "decoding…"; play and seek enable when every stem
  is ready — a partial mix is not the song.
- **Loading is three stems at a time** (`LOAD_CONCURRENCY`): fetch and decode
  overlap; more in flight only raises peak memory. The manifest URL is the
  AAC playback rendition when one exists (docs/uploads-and-blob.md), which
  on a 50 Mbps connection took a six-stem song from 68 s to 9 s.
- **Memory is the binding limit**: ~128 KB per second per channel at the
  32 kHz context, so a 4-minute stereo stem is ~60 MB decoded. There is
  no cap a band meets: `MAX_STEMS_PER_SONG` (256) is a sanity ceiling on
  the reorder schema and the reserve step (Kevin lifted the cap of 32 on
  2026-10-12; failed uploads do not count). Instead the app reckons the
  decoded size (`decodedStemBytes`, duration × channels × 32 kHz × 4) and
  says so: the uploader notifies after a batch that takes the song past
  `STEM_MEMORY_SOFT_BYTES` (a gigabyte), and the player shows a note
  under its header when the estimate passes the device's budget
  (`stemMemoryBudget`: a quarter of `navigator.deviceMemory` where Chrome
  reports it, else the gigabyte). Blob serves files with a 30-day cache
  header, so repeat loads are decode time, not download time.
- **When the browser runs out of memory** there is no event to catch: iOS
  kills the tab and reloads it, Chrome shows its error page. So `load()`
  writes a marker to sessionStorage (`stemshovel.loading`: the stem ids,
  the count, the estimate, the time) and clears it when the load ends
  either way; a marker for the same stems less than fifteen minutes old
  found at the next load means the last never finished, and the engine
  sets `lastLoadDied`, the player says so ("the last attempt to load this
  song in this tab did not finish…"), and a warning goes to Sentry with
  the count and the estimate. A load that fails outright is reported to
  Sentry too, and when the error is a RangeError, mentions memory or
  allocation, or the song is past the soft gigabyte, the message under
  the player says the browser may have run out of memory and what the
  song weighs. sessionStorage survives a reload in the same tab, which
  is the case that matters.
- **Dual-mono files collapse to one channel** after decoding
  (`lib/audio/mono.ts`): if every L/R sample pair is within 1e-3, the stereo
  buffer is replaced by a mono one; real stereo is untouched.
- **Sections timeline** (`SectionTimeline.svelte`): when a song has
  sections (`song.sections`, `[{ name, start }]` in seconds), a row above
  the stems shows a block per section on the same grid as a stem row, so
  the blocks sit over the waveforms, labeled with a short form of the
  section's name (`utils/sectionLabels.ts`: In, V1, Ch1, V2, Br, Out —
  `sectionAbbreviation` plus an occurrence number when a name recurs; the
  full name when the block is wide, by a container query, and on hover).
  The name is the section's identity, the chart's `## Name` heading
  (the roman-numeral `index` the rows once carried is gone: barmark
  identifies a section by its name); the block containing `engine.position`
  is highlighted and clicking one seeks to its start. Members edit
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
  song's time scale (same seek and keyboard behavior), and back. The file
  is fetched from Blob and parsed in the browser once per URL — a small
  SMF reader that merges tracks, follows tempo changes and keeps note
  on/off only. The file's 0 is drawn at `song.startAt` (`rollNoteSpan`,
  2026-11-05): a DAW exports MIDI from bar 1, while the recording may
  carry a count-in before it, so without the shift the notes sat early by
  the count-in.
- **Tempo, key and time-signature detection** (`src/lib/audio/analysis.ts`):
  while stems upload, each decoded buffer yields an onset-strength envelope
  (spectral flux, 2048-point FFT, hop 256 = 125 fps) and two chroma
  profiles (8192-point FFT from 110 Hz to 4.2 kHz, and a 16384-point bass
  one from 55 to 260 Hz; spectral peaks only, each frame normalized, so
  drums do not smear them); the batch's features are summed and analyzed
  as one mix: tempo by autocorrelation of the detrended envelope over
  50–210 bpm, candidates outside 80–170 held back (the half- or
  double-time lag often correlates as well as the beat; tuned on MMKK's
  real mixes) with a gentle log-normal around 120, refined by a parabola and then by
  the autocorrelation peak at 2, 4, 8, 16 and 32 beats (each pins the
  period to 1/k frame), which is what makes DAW tempos come back exactly;
  meter by a vote of the stems: each stem's raw envelope compares its
  autocorrelation at 3+6 beats against 4+8 and leans one way, the leans
  are combined weighted by their size (a flat kick abstains, a riff with
  a three-note feel cannot outvote the rhythm section; before, the summed
  envelope tipped a user's 4/4 song to 3/4), and 3/4 needs a 3 % win. The
  meter confidence is the agreed lean; under 0.15 the song page asks the
  AI to listen as well, waiting for the mix to render after an upload (up
  to three minutes), and its answer shows with "Use these". Key by correlating the chroma with
  the Krumhansl-Kessler major and minor profiles, the bass chroma deciding
  between a key and its fifth when they rank level. Measured on MMKK's
  mixes (2026-09-16): every declared tempo exact, four of five keys right
  (Mop Heart hears E where A is declared), the 3/4 song in 3/4. Only the first 90 s are
  analyzed. The uploader hands the result to the song page: a song with
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
  doubled as the likely root when it sounds for at least 15 % of the bar,
  so a pickup into the next chord does not rename this one) matched
  against chord templates (major, minor, 7, maj7, m7, sus4, 7sus4, sus2,
  dim, aug, 5); a template tone under 12 % of the profile counts as
  missing (a power chord's faint harmonic is not a sus2), a chord rooted on
  the bass gets a bonus, the previous bar's chord is kept when it fits
  nearly as well, and a bass outside the chord shows as a slash chord.
  Consecutive equal bars merge; the result shows as `| D | A | Bm | G |`
  lines. Tuned on Peaceful Dreams against its chart: the verse roots match
  bar for bar; the intro's D pedal still wanders. Takes a few minutes on a
  CPU-only browser, tens of seconds with WebGL.
- **Notes transcribed on the server** (`src/lib/server/notes.ts`): after a
  song's renditions and mix, and from the song page as a backstop for
  members, `ensureSongNotes` downloads the stems' renditions, weighs their
  tonalness on 30 s, and transcribes the weighted mono of the tonal ones
  with Basic Pitch in 60-second segments, appending to `song.notes_json`
  and advancing `notes_done_seconds`; it stops after 200 s of work and the
  next trigger carries on, `notes_key` (the mix key of the stems) marking
  completion, a fresh stem set starting over. The model runs in a **child
  process** (`process.execPath --input-type=module -e …`, packages by
  `import.meta.resolve` URL, the model from `/basic-pitch` on our own
  origin): TensorFlow.js on the CPU is about a minute of solid compute per
  minute of audio, and in the server's own event loop it stalled every
  other request on the instance (a docs page took 18 s; 2 s with the
  child). Skipped for no-AI songs. `songNotes` (a remote query, members)
  hands the notes to the page, which uses them when complete and falls
  back to transcribing in the browser otherwise.
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
  The chords come back as one space-separated string ("D5 % A5 …") and the
  chart is capped, so the answer is a fraction of its earlier 11k tokens.
  The action sits in the Chart panel's ⋯ menu (next to the edit button;
  while a run is listening or drafting the menu shows its progress and a
  Cancel) and in song settings; it runs Detect chords first when that has
  not happened, and the draft renders in the panel above the chart.
  "Save sections" writes them (bars → seconds on the grid; confirms when
  sections exist); "Save as chart" writes the chart document (confirms
  when one exists; `saveChartDraft`). Five drafts per user per hour;
  logged to `ai_request` as `chart-draft`. On Peaceful Dreams the draft
  kept the song's ten sections at their bars.
- **Ask AI to check** (`src/lib/server/aiDetect.ts`, `askAiAboutSong` in
  songs.remote.ts): a member sends the rendered original mix and the
  song's score to `google/gemini-3-flash` through the AI Gateway, with
  the song's tempo and time signature as facts for following the bars;
  the JSON answer (the key and `keyChanges` as `{at, key}`, the chart's
  meter, its tempo mark and later marks as `tempoChanges`, notes) shows
  under the changes editor with "Use these", which saves the values into
  rows at once. The button is disabled on a song without a score, and
  the answer keeps tempo and meter only where the chart states them
  (below, "The song-check reads the chart"). Ten per user per hour;
  needs `AI_GATEWAY_API_KEY`, otherwise hidden. Every call is logged to
  `ai_request` (prompt text, reply, parsed answer or error, duration,
  tokens) and listed on `/admin` for review.
- **Documents in the panel** (`SongDocPanel.svelte`): one component reads
  a chart, lyrics or notes document (its sanitized HTML) and, when
  `editing`, mounts `MarkdownDocEditor` inside a form on the `saveDoc`
  remote form, so the document is edited without leaving the song; a save
  re-renders through `refreshAll()`. The form's fourth kind, `mynotes`,
  is the signed-in person's private note on the song (`song_user_note`,
  loaded as the page's `myNote`): any viewer of the song keeps one, and the
  save answers with the rendered `html` as well as the version. In the panel the editor runs in
  its `mode="embedded"`: autosave (a save 1.5 s after the last change, ⌘S
  at once; no Save button or version, except the Save that confirms an
  emptied document), no title, the hint as the ⓘ tooltip, no shading, the
  text keeping the reading view's margin with the block buttons tucked
  into the panel's padding while the editor is hovered or focused, and no
  Done (the toolbar's check button and Escape close instead). The box is
  bounded (70vh) and scrolls inside, in both modes, and while editing an
  "Edit mode" badge is anchored to its bottom-right corner, outside the
  scrolling form. The default `"standalone"` mode is the full-page editor.
  The page renders only the
  active document (a remote form attaches to one element) and closes it
  through the panel's exported `close()`, which waits a serialize debounce
  (the WYSIWYG writes markdown 250 ms after a keystroke), saves what is
  unsaved and then leaves edit mode; a save marks the editor clean only if
  nothing changed while it was in flight. The `[doc=songDoc]` route and
  the user docs keep the full-page editor with its Save button.
- **Comments** (`CommentTimeline.svelte`, `lib/remote/comments.remote.ts`):
  the documents panel has a Comments tab (scrollable list, newest last,
  author, date, an "edited" badge, the position as a link that seeks) and
  a + button opening one popover for posting and editing (title, text,
  position typed in any format and read against the song's grid on the
  server). Ctrl / ⌘-click or right-click on a waveform or MIDI roll opens a
  menu at the pointer with "Seek here" and "Comment here" (position
  prefilled): `PointerMenu.svelte`, a `ContextMenu` whose trigger is a
  hidden anchor at the pointer (`at`), so the menu is a native popover on
  the top layer (above a popped-out panel) that flips at the viewport's
  edges and closes on a click outside or Escape. The player owns the stem
  rows' menu ("Seek here" is its; the page adds "Comment here" through
  `contextItems`); the page keeps the Comments row's and a demo's. Located comments draw as icons on a row under the last stem,
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
  (`#lib/keys.ts` decides what counts as text entry; the project playlist
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

## The tempo ladder (2026-10-29)

stem-bench Studies 9 and 10 (FINDINGS.md, "AI features") measured the
detector's one remaining tempo failure class on both corpora: every miss
was the right grid counted at another level — exactly half of a declared
224, exactly two thirds of a declared 145, every 6/8 item read at 1.5×
because the meter vocabulary (`"4/4" | "3/4"`) had no compound rung to
land on while the declared settings accept 6/8 already. The bench's
proposal (docs/tempo-grid-plan.md) is built in part: the detector keeps
its summed-envelope autocorrelation (it beat every per-stem and neural
alternative) and gains a ladder; beat timestamps and a neural tracker
are deferred until a tempo map for drifting live recordings wants them.

- **Subdivision.** `analysis.ts` tests the detected beat lag L for a
  three-feel, on the autocorrelation of the summed envelope: at the
  sub-beat, ac(L/3) > 1.15 · ac(L/2) and ac(L/3) ≥ 0.55 · ac(L)
  (running triplets measure 0.67–0.69 of the beat, swing at most 0.5 in
  theory and 0.46–0.50 measured: a swung 4/4 stays straight, on a thin
  margin; a comparison of L/3 against 2L/3 cannot do it, since an
  envelope that repeats every beat has ac(τ) = ac(L − τ)); and at the
  super-beat, ac(1.5L) > 1.05 · ac(2L) with ac(1.5L) ≥ 0.2 · ac(L), the
  case the bench saw on every 6/8 item: the autocorrelation picks the
  quarter where the beat is the dotted quarter (the margin is low
  because the log-compressed envelope flattens accents: a 6/8 whose
  dotted beats are four times louder reaches only 1.02–1.12, while
  straight eighths cannot exceed 1.0 and measure 0.91–0.97). Either
  firing makes `tempo.subdivision` 3, the super-beat case re-picks the
  pulse at L × 1.5 (refined), and `detectMeter` answers `"6/8"` (the
  only compound meter emitted). Straight meters behave as before;
  silence now gives bpm 0 instead of the range's first lag. The
  constants carry these numbers with their reasons; the 1.05 margin is
  the one to watch for false 6/8 on real recordings, which stem-bench
  Study 11 measures.
- **Alternates.** `tempo.alternates` lists the rungs ×2, ×½, ×1.5, ×⅔
  and ×3 of the chosen bpm with the autocorrelation at each rung's lag
  relative to the chosen one as `strength`; the song page shows the
  strong ones ("112 bpm, or 224 counted in eighths") through
  `utils/tempoRungText.ts`, whose labels follow the beat's
  perspective: a straight beat (a quarter) shows ×2 "counted in
  eighths" and ×½ "in half notes"; a compound beat (a dotted quarter)
  shows ×3 "counted three to the bar" (its eighths) and ×1.5 "in
  quarters" (the hemiola). The other rungs are left out of the text on
  each side (straight running eighths correlate at three eighths too,
  1.02–1.10 on a 4/4 at 120, so "or 80 counted in dotted quarters"
  would mislead on a straight song; and twice a dotted quarter is
  nothing a musician counts, which v0.200.0 printed as "or 149 counted
  in eighths" on a 6/8 at 75). The array keeps every rung.
- **One comparison, three surfaces.** `utils/tempoLadderMatch.ts`
  decides whether a declared tempo and a detected one are the same
  grid: direct, ×2 and ×½ always; ×1.5 and ×⅔ only when the song's
  own time signature is compound (`utils/isCompoundMeter.ts`); ×3,
  "counted three to the bar" (224 in 3/4 against a detected 74.7, the
  bar heard as one beat), only when it is triple
  (`utils/isTripleMeter.ts`). The gates are the declared meter's and
  never the detector's own subdivision flag: stem-bench Study 11b
  (2026-10-29) caught that flag firing at a two-thirds-wrong pulse
  whose third is the song's true eighth (145 heard as 96.7), where it
  excused exactly the gap the warning exists for; and a test at the
  declared tempo's lag, the bench's first proposal, mirrors the same
  confound on a straight song with running eighths declared at two
  thirds (the declared lag's third is again the eighth grid). A gate
  on the band's own meter has no acoustic confound and is a strict
  subset of what shipped in v0.200.0. At a 3:2 or ×3 rung the time
  signature counts as agreeing too (6/8 against 3/4 is the count
  difference itself). It sits behind `settingsChartDisagreement` (a chart marked ♩ = 112
  against settings of 224 no longer warns; the tolerance is the larger
  of 3 bpm and 2 %), the Scan stems offer (the
  stems "agree with your 224 bpm, heard as 112 counted in eighths" and
  the tempo is not offered for replacement) and the upload-time notice
  when a song already has settings. The declared value stays
  authoritative as the band's intent; the ladder only stops the app
  calling an equivalent count a mismatch. stem-bench Study 11 validates
  the rule's false-accept rate and the subdivision test on both corpora.

## One tempo for the page

The metronome engine's `bpm` (`lib/audio/metronome.svelte.ts`, remembered
per browser) is the session tempo (Kevin, 2026-10-04): every instrument
on a page follows it unless told not to, each at a ratio of it
(`constants/tempo.ts`, `TEMPO_RATIOS` ½, 1, 2), so the drums, the chord
player's arpeggiator, the progression pad, the piano's click and the
looper agree on the home page, the recorder and the looper page alike.

- **The drum machine** keeps `project.bpm` (saved with the beat) and
  exposes `bpm`, the tempo it plays at: the session's at `tempoRatio`
  while `followTempo` (on by default, both per browser in
  `utils/drumMachinePreferences.ts`; the controls sit on the caret of the
  Tap Tempo split button at desktop and in the phone's tempo menu), else
  the beat's own. Its own controls
  (`setBpm`, Tap) set the beat's tempo and, while following, the session's
  through the ratio; a beat that arrives with a tempo (a preset, a saved
  beat, a song's, undo, the home demo, a share link) adopts it into the
  session (`#adoptTempo`); the remembered project does not, the session's
  own memory being the newer one. The drum machine listens to the
  metronome (`metronome.listen`) and, while following, keeps `project.bpm`
  at the tempo it plays at (so a saved or shared beat carries the tempo
  you heard) and refreshes the bus, so the tempo-synced delay follows.
  Switching following off keeps the tempo the beat was playing at as its
  own.
- **The chord player's arpeggiator** steps at `metronome.bpm ×
  chordPlayer.tempoRatio` (the Tempo select in its menu; presets and demo
  setups carry the ratio); the pad plays at the session tempo.
- **The looper** owns the bars: while unlocked its tempo follows the
  session and its own controls set the session; with layers the page's
  effect holds the session to the loop (`syncTempo`), and a drum machine
  that is not following is set too.
- The metronome and the drums still never play together (starting one
  stops the other); a drum machine not following takes the metronome's
  tempo then, as before.
- **Swing too** (Kevin, 2026-10-04: recording in the looper or the
  recorder wanted the drums and the chord player swinging together):
  `metronome.swing` is the session swing (in the preferences; the click
  itself stays straight), told to the same followers. The drum machine
  following keeps `project.swing` at it, its slider sets it, and a beat
  that arrives adopts its swing into the session with its tempo; the chord
  player's one swing is simply the session's (set from its arpeggiator or
  strum menu, kept by the metronome rather than its own key), so a preset
  or demo with a swing moves the drums' too while they follow.

## iOS and the ring/silent switch

iOS silences the Web Audio API under the ring/silent switch but lets media
elements play, like a music app. The recorder, the demos and the project
playlist use `<audio>` elements, so they play on a muted phone; the stem
engine runs on an `AudioContext`, so it did not. Before it plays, the
engine calls `playThroughSilentSwitch()` (`src/lib/audio/`): on iOS it sets
`navigator.audioSession.type = "playback"` (the AudioSession API, Safari
17+), and where that is missing it starts a silent looping `<audio>`
element on the same gesture, the older trick that moves Web Audio onto the
media channel. The session type is set on every play, because the recorder
sets it to `"play-and-record"` before `getUserMedia` (WebKit refuses to
capture under `"playback"`: "AudioSession category is not compatible with
audio capture", seen on 2026-09-19 after playing a song and then opening
the recorder in the same tab), and either page may follow the other in one
document. `src/lib/utils/audioSession.ts` is the accessor. Nothing detects
the switch itself: no web API exposes it.

## Several keys (2026-10-11)

A feature request (2026-10-07: a song in C that passes through A♭, F and
E♭; "I'd like it if I could override the detected key with something
like `C major (also A♭ major, F major, E♭ major)`") and Kevin's note
that the timeline showed only the key in force. The data model already
kept keys as timed changes; what was missing was a detector for more
than one and a display that names them all.

- `extractKeySegments(buffer, boundaries)` in `src/lib/audio/analysis.ts`
  takes the chroma of each stretch between boundaries over the whole
  buffer (the tempo looks at the first 90 s; the key looks at all of it),
  `combineKeySegments` sums the stems', `keyScores` gives every key's
  profile correlation for a stretch (lifted a little where the bass sits
  on the tonic), and `detectKeys` finds the best path through the 24
  keys over all the stretches with a cost for every switch (Viterbi,
  penalty 0.35 in correlation units): a stretch on its own may lean to a
  neighbor key (the relative, the fifth), and a stretch where the chroma
  says little takes the key around it, so what comes out is the few keys
  the song moves through, each from where it begins. Tested with two
  chords in one buffer: C major then E♭ major, and repeated quarters
  merge. On the user's own song (Kevin uploaded it on dev, 2026-10-11)
  ten-second windows gave G major → E minor → B♭ major → G major where
  the chart says C, A♭, F and E♭: the relative and dominant neighbors of
  the right keys, the classic weakness of profile matching on a modal
  vamp (Fmaj9–Em7 has no C in the bass), which is why the override
  matters and why the chart's chords would be the better source (a
  chord-symbol parser, later).
- **Scan stems** (song settings) reads the keys at the song's sections
  when it has two or more, else every ten seconds (`keyWindows`,
  `src/lib/utils/keyWindows.ts`), writes a key change where each begins
  (replacing every earlier key change, tempo and meter only at 0:00 as
  before) and summarizes as `keyLine()` (`src/lib/utils/keyLine.ts`): the
  starting key, then "(also …)" with the others in order of appearance.
  The song-info popover's line uses the same. **Upload-time detection**
  (the uploader and the replacer) reads the keys the same way, every ten
  seconds of the batch, so a song gets its keys from the first upload.
- The section timeline's key lane carries the keys as they lie in the
  song (the one in force lit, each label clipping in a short stretch), and
  every lane marker is a button that seeks to where its change begins
  (Kevin, 2026-10-12, after testing the score-read keys: the list of keys
  under the section name went, the lane is the list; the word "keys:"
  stays under the section name as the lane's label when the song has
  two or more keys).
- The override is the rows in settings: add, move or remove key rows.

## The score as the AI's chart (2026-10-12)

The profile detector kept hearing neighbor keys on Kevin's modal vamp
(above), and Kevin's thought was the obvious one: when a song has its
notation uploaded, go straight to the AI and give it the chart.

- **What goes along.** `scoreForAi(accountId, songId)` in data.ts picks
  the song's first ready MusicXML (`song_notation`), else its first ready
  attachment marked as notation (`song_pdf`, a PDF or an image).
  `askAiAboutMix` takes it as a fourth argument and `loadScore` reads it
  from Blob: a `.mxl` is unzipped with fflate (`musicXmlFromMxl`,
  `src/lib/utils/musicXmlFromMxl.ts`: the rootfile `META-INF/container.xml`
  names, else the first XML outside META-INF), and the XML is boiled down
  by `musicXmlSummary` (`src/lib/utils/musicXmlSummary.ts`) to one line
  per measure of the first part that carries `<harmony>` (else the first
  part): the key signature where it changes (`keyName`: fifths and mode
  to "E♭ major"), the time signature, `<sound tempo>`, rehearsal marks,
  `<words>`, repeats (`|:` `:|`), endings, segno/coda/fine, and the chord
  symbols (root, kind, degrees, bass: "A♭add9/C"; a `<kind text>` wins
  when the file supplies it). A plain text scan, no XML parser, capped at
  12 000 characters. The summary rides in the text part after the
  question, and in the `ai_request` log. A PDF or image goes as a second
  file part beside the mix (Gemini reads both), as long as mix + file
  stay under 19 MB; otherwise, or when the file cannot be read, the
  check runs without it.
- **What the prompt says.** With a chart attached: take the keys from
  it (its key signatures and the chords it moves through), use the
  recording to place each change in seconds by following the bars at the
  tempo heard, counting repeats as played; when the recording and the
  chart disagree, say so in `notes` and answer for the recording. With or
  without a chart the answer now carries `keyChanges` (`{at, key}`, up to
  24): a passing or borrowed chord is not a change, a section that
  settles in a new key or a last-chorus modulation is.
- **On the song page.** "Use these" writes the key changes as key rows,
  dropping every earlier key row when the answer names any (tempo rows
  after 0:00 were already replaced the same way). The card says "The AI
  read the score and listened" and lists the key changes with their
  times. **Scan stems** on a song with a score and the AI at hand
  (`hasScore`: a ready notation file or notation attachment;
  `data.aiAvailable`) calls the AI first (`askAiWithScore`): the answer
  is saved at once when the song has no settings, else offered under
  the rows; when it cannot answer (409, the mix not rendered yet; the
  gateway down) the stems are scanned as before, with a notification
  saying so. **An upload** still gets the detector's result at once (the
  mix renders in the background), then `checkUnsureMeter(d, applied)`
  waits for the mix as it did for a close-call meter and, when the song
  has a score, replaces the detector's settings with the AI's answer (the
  detector replaced nothing: the song had no settings before the upload).
- **A PDF or image is read first (2026-10-12, later the same day).**
  Kevin's chart is a six-page engraved score (guitar, tab, voice) with
  key signatures at bars 1, 15, 19, 26, 33 and 40 (C, A♭, F, E♭, F minor,
  C). Sent to Gemini as a file beside the mix it came back F, A♭, F,
  A♭, F: the model read the lyrics and chord symbols but not one key
  signature. The MusicXML path had worked because the keys reach the
  model as text. So `readChartWithAi(score, bytes, mediaType, who)` has
  the document-reading model (DRAFT_MODEL, Fable) write the PDF or image
  into the summary `musicXmlSummary` makes: one line per measure that
  carries anything, the key from the key signature where it changes,
  time signature, tempo, rehearsal marks in brackets, words in quotes,
  repeats and endings, chord symbols after a colon (since 2026-11-03 the
  read is a barmark chart instead: "The chart read is barmark"). The text is cached
  in Redis (`chart:<sha256 of the url>`, a month; Blob pathnames are
  never reused, so the URL is the version) and logged as `chart-read`
  with the rest. `loadScore` returns `{text, file}`: the summary, and
  the file as well when mix + file fit under 19 MB, so Gemini has both.
  On Kevin's chart the read took 17 s and named C at 1, A♭ at 15, F at
  19, E♭ at 26 and C at 40, missing only the four flats at 33 (it kept
  E♭ through the F minor passage). A read that fails (no `m<n>` line)
  falls back to the file alone.
- **Not done.** A deterministic chord-symbol parser mapping bars to
  seconds would need the tempo map and the repeats played; the model
  does that alignment by ear, which is the point of sending both. The
  chart document (markdown) is not sent: its chords are free text, and
  the model reads a score far better; sending the chart text when there
  is no score is the next step if the keys still come out wrong.

## Detect sections (2026-10-12)

Kevin's next ask after the score-read keys: fill the sections in the
same way, especially when a score is there.

- **Server.** `askAiAboutMix` was split: `loadMix` and `loadScore` fetch
  the mix and the score, and `listen({kind, who, mix, score, chart,
  system, question, schema})` makes the Gemini call with the mix (and a
  PDF or image score) as file parts and the MusicXML summary in the text,
  logs the request and the reply to `ai_request` under `kind`, and parses
  the JSON with the valibot schema. `detectSectionsWithAi(mixUrl,
  context, who, score)` asks for `{sections: [{at, name}], confidence,
  notes}` (up to 64, names up to 40 characters, the first at 0): a
  section is a stretch with its own material or function, boundaries on
  the downbeat to a tenth of a second, a pickup belongs to what it leads
  into. With a score the prompt says to take the sections from the
  chart's rehearsal marks, words, double bars, repeats and endings and
  place them by ear. The question carries the song's tempo and meter,
  the account's section vocabulary (`sectionVocabulary(accountId,
  excludeSongId)` in data.ts: every other song's section names, most
  common first, the top twelve sent) and the song's existing sections,
  to be kept unless the recording plainly says otherwise.
- **Remote.** `detectSections` in songs.remote.ts: members, the same
  gates as `askAiAboutSong` (configured, not `noAi`, the shared
  `ai:<user>` limit of ten an hour, 409 until the mix is rendered).
- **Page.** "Detect" beside "Add row" on the Sections panel
  (`detectSongSections`): with no sections the answer is saved at once
  (`useSectionsAnswer`: roman-numeral indices, starts rounded to a tenth)
  and a notification says how many; with sections it shows as a card
  ("The AI read the score and listened. It finds Intro at 0:00, Verse at
  0:14 …") with "Use these" (a `confirm` before replacing, as the chart
  draft's sections do) and "Dismiss". The 409 shows under the rows as
  "The mix is still rendering".

## Snapped to the bar (2026-10-12)

Kevin's test of the score-read keys: many of the key changes landed on
beat four of the bar before, where the model heard the chord come in
early (a pickup, or a timestamp a few hundred milliseconds off).
`snapToDownbeat(grid, seconds, maxBeats = 1.5)` in
`src/lib/audio/measures.ts` moves a time to the nearest bar line when
one is within a beat and a half, forward or back, and leaves a time in
the middle of a bar alone; before `startAt` nothing moves. "Use these"
on the tempo and key answer snaps the tempo shifts and key changes on
the grid the answer itself makes (its tempo and meter at 0 plus its
tempo shifts, with the song's `startAt`), so a fresh song is snapped
too; `useSectionsAnswer` snaps the sections on the song's grid
(`posCtx.grid`), which is null until the song has a tempo and meter, in
which case the times stay as heard. Then the two are drawn together
(Kevin: key changes and section starts line up most of the time, and
none of his did): a snapped key change within a bar's length of a
section's start moves onto it (`snapToAnchor`, `barSecondsAt`), and a
snapped section start within a bar of an existing key change moves onto
that, so whichever is detected second lands on the first.

## The song-check reads the chart (2026-10-24)

stem-bench Study 4 (FINDINGS.md, "AI features") measured `askAiAboutMix`
against synthesized mixes whose tempo, meter and key are true by
construction. Blind, the model pinned tempo to a 120 to 180 bpm genre
prior at confidence 1.0, named wrong keys and found none of six changes;
handed the detector's candidates it echoed them, right or wrong, 10 to 12
times in 12; handed the chart it was perfect on every field and placed
all six changes within four seconds. The feature was a chart-anchoring
tool wearing a second opinion's clothes, so the app now says so:

- **The score is required.** `askAiAboutSong` answers 412 without one
  ("Attach the song's score or chart first"; 412 rather than 409, which
  the page takes as "the mix is still rendering" and waits on). The
  button is disabled with that reason in its title. `askAiAboutMix`
  takes the score as a required argument and throws when it cannot be
  read.
- **Settings as facts, never the key.** The question gives the song's
  tempo and time signature "to follow the bars"; the key is not sent,
  since a handed key was echoed 10 of 11 times even by the better model.
  The prompt no longer asks the model to confirm or correct anything.
- **Tempo and meter from the chart's text, never the model** (since
  2026-10-28, stem-bench Study 7; before that `chartStatedAnswer` kept
  the model's values wherever the chart merely mentioned one, and the
  model echoed the settings' tempo verbatim on chord charts, 47 of 47
  cells, once even under a chart that stated the truth).
  `utils/chartStatedValues.ts` parses the summary's `tempo <bpm>` marks
  and its first time signature (and a band chart's "120 bpm", "♩ = 120"
  or "3/4"), and `chartStatedAnswer` (`src/lib/utils/chartStatedAnswer.ts`)
  substitutes them: the answer's tempo and meter are the chart's, null
  where it states none, whatever the model said; `tempoChanges` keep only
  the model's placements in seconds, as many as the chart has later
  marks, each with the chart's bpm. The model is left with what measured
  perfect: the keys from the chords and where each change falls. Without
  a summary (a PDF the reader could not write out) only the keys survive.
  `AiAnswer.meter` is therefore nullable. On the page a null writes no row
  and, for tempo, leaves the song's later tempo rows alone; the card and
  the notification print only what the chart said. When the song's
  settings disagree with the chart's marks (a tempo more than 2 % off, or
  another meter), `utils/settingsChartDisagreement.ts` adds a warning that
  the key changes are placed approximately: the model follows the bars at
  the settings' tempo, and Study 7 saw placement fall from 3/3 to 1/3
  under a wrong one.
- **The close-call meter check is gone.** The detector's 3/4-or-4/4
  lean under 0.15 used to send the song to the model with the detector's
  meter as a candidate, and the page said "The AI agrees" or "hears 3/4
  instead". Blind meter was the model's weakest field and with a
  candidate it echoed, so the check could only confirm a guess or
  suggest a wrong one with full confidence. `UNSURE_METER` and the meter
  branch of the old `checkUnsureMeter` are removed; `checkWithScore`
  remains for an upload on a song with a score.
- **No confidence.** The field read 1.0 on fabricated answers, so the
  song-check and the sections check no longer ask for it and the cards
  no longer show "(87% sure)".
- **Not changed.** Detect sections still runs without a score (the study
  did not measure it; the chart's rehearsal marks lead when there is
  one). The model stays `google/gemini-3-flash`: the successor tier
  pushes back on wrong tempo and meter candidates but swallows a wrong
  key too, and with the detector owning tempo and meter the swap buys
  little.

## The chart read is checked (2026-10-24)

stem-bench Study 5 (FINDINGS.md, "AI features") composed the real path,
engraved page to chart read to chart-anchored song-check, and found the
chain equals the truth-fed ceiling with a competent reader: the song-check
inherits the read's accuracy one to one, so a bad read anchors everything
after it. Its anatomy also corrected Study 3: the PDF losses were the
bench's own PDF generator dropping every accidental (a WinAnsi font has no
music glyphs), which the model then read faithfully. The app never
rasterized PDFs and now does not plan to; instead the read is checked:

- `utils/chartReadWarnings.ts` reads `readChartWithAi`'s text (a barmark
  chart since 2026-11-03, through `parseChart`, each written bar judged
  once; the `m<n>` summary form for a MusicXML summary) for the
  reader's own "Note:" lines (an unreadable page, a doubt it voiced
  unprompted) and for the dropped-accidentals signature, judged against
  the key in force at each measure (since 2026-10-28, stem-bench Study 6):
  two or more chords rooted on a letter their own key signature alters
  (the first n of F C G D A E B for sharps, B E A D G C F for flats, n ≥ 2)
  yet written bare, while no chord symbol in the chart carries an
  accidental at all, among eight or more chords (one accidental is no
  evidence: a song in G major can go pages without an F♯; a flat on a
  slash bass counts). Study 6 measured the earlier pooled rule (the
  chart's largest signature against every chord) on 148 saved reads: it
  caught every detectable corrupted read but flagged 4 of 42 clean ones,
  honest sharp-key charts whose chords legitimately carry none; scoping
  to the key in force kept 10 of 10 and flagged 1 of 42, a read that had
  placed a modulation late. The shipped rule keeps the pooled rule's
  no-accidental-anywhere condition on top, which silences that last flag
  (0 of 42 on the same reads, a number the bench did not register; Study
  6b registers the rule as shipped on new pages). The warning names both
  causes, a file that lost its accidentals or a misread.
  `keySignatureSharps` maps majors and minors to their signatures.
- `askAiAboutMix` runs it on a read score (never on the band's own chart,
  which is not a read) and returns the lines as `AiAnswer.warnings`.
- The song page shows them in amber on the AI card, and `askAiWithScore`
  (the check that follows a score upload) no longer applies a doubtful
  answer to the song's settings unasked: it notifies with the first
  warning and leaves the card for the user to judge, "Use these" still a
  click away. A clean read behaves as before.

The read itself is shown and corrected since the same day (next).

## The chart read is stored (2026-10-24)

A score's read lives on its file: `song_file.chart_read` holds the per-measure
summary as the model wrote it or as a member corrected it, and
`chart_read_edited` marks a correction. `scoreForAi` hands both to the song-check
with the file's id; `loadScore` takes a stored read as the chart's text (no model
call, no Redis), still attaching the file when it fits beside the mix, and
otherwise reads the file with `readChartWithAi` and stores the result
(`saveChartRead`, edited false). Redis stays a second-level cache keyed by the
file's URL (`chartCacheKey`). Study 5 asks for the read to be seen before it
anchors a check: `readChartOfFile` (files.remote.ts) returns the stored read, or
reads and stores one (a few per hour; a stored read is free), with the
`chartReadWarnings`; `saveChartReadOfFile` keeps a member's correction (a chart
barmark plays at least one bar of, `barmarkChartPlays`; before 2026-11-03 one
line per measure, `m1 …`), which no model read overwrites; `clearChartReadOfFile`
forgets the read in the row and in Redis, so the next check reads the file again.

On the page: a score tile's ⋯ menu on the Chart tab's notation view has
**What the AI read** (`SongNotationPanel.svelte`, members with the AI at
hand), which opens the read in a floating panel: the lines in an editor,
what looks wrong in amber (`chartReadIssues`, live as you type), the chart
editor's readout under the text (`ChartReadout`, 2026-11-05: the bars the
read plays, its sections and its length at the song's tempo and meter at
0:00, which the song page hands the panel as `chartDefaults`, so a missed
repeat shows as a length that does not match the recording), **Save**
(the correction, saved as the read the song-check uses from then on, marked
"corrected by the band"), **Read again** (clears the stored read, with a
confirmation when it was corrected, and the model reads the file afresh)
and **Check the song** (the page's `askAiWithScore`). The AI card's
warnings carry **Review what the AI read**, which switches to the notation
view and opens the first score's read. Migration 0097 adds the columns.

## The chart read is barmark (2026-11-03)

barmark 0.12.0 can spell everything a score read carries (endings,
directions, rehearsal marks, words on a bar, written bar numbers: barmark
issue 70), so the app's second chart grammar went (barmark integration
audit, item 5). `readChartWithAi` asks the reading model for a barmark
chart (`CHART_READ_SYSTEM`): `# title`, a `Part:` prose line, a
`key: …, time: …, tempo: …` line with only what the score shows, then every
measure once as a cell (`/` keeps the harmony, `%` the repeat sign), so the
bars' written numbers are the score's measure numbers; `|:`/`:|` and `|1`/`|2`
endings; directions, rehearsal letters (`@A`) and quoted words as cells;
`## Name` headings for section names the score prints; a `key:`, `time:` or
`tempo:` line where one changes; `Note:` for an unreadable page. The answer
passes when `parseChart` plays a bar (logged as `parsed: {bars, errors}`),
and the Redis key is `chart2:` so no summary cached before is served.
Kevin's six-page score (the 2026-10-12 note) read into 41 written bars in
23 s with no diagnostic, the key changes, the `"Key: F Major"` text, the
chorus's `|1-3 … :|` / `|4` endings and the rehearsal letters all placed
under the old read's measure numbers.

What follows from one grammar: `barsOfScore` reads a stored read with
`barmarkChartBars`, so a score's read and the band's chart align the same
way, a bar's `section` being its heading, else its rehearsal mark, else a
word `chartSectionName` knows; `saveChartReadOfFile` accepts a text barmark
plays at least one bar of (`utils/barmarkChartPlays.ts`; a line with an
error is left out of play and reported, so a member can save and fix);
`chartStatedValues` reads a barmark chart's `tempo:` and `time:` directives
first (the band's charts too, which the prose reader had not read a
`tempo:` line of), falling back to the prose and `m<n>` readers;
`chartReadWarnings` judges a barmark read through `parseChart`; and the
read editor (`SongNotationPanel`) lists barmark's errors with their line
numbers in amber as the member types (`utils/chartReadIssues.ts`), since
barmark drops a whole bar line for one bad chord while the written numbers
after it hold, which would align short unnoticed. `loadScore` flags a
barmark read (`ScorePart.barmark`) so `CHART_NOTE` describes it to the
listening model as such; a MusicXML summary keeps the `m<n>` form and its
note until barmark's MusicXML translator (item 6).

Reads stored in the old form were to be rewritten by a converter
(`chartReadToBarmark`, `convertChartReads`, `scripts/convert-chart-reads.ts`:
mechanical, and accepting a row only when the new text had no error and
`barmarkChartBars` played the same bars from it as the legacy `chartBars`
from the old; a `D.S.` or `coda` word stayed words, since a direction cell
changes the play order). Its dry run on production the same day found no
read in the old form, as dev and staging had none, so the converter and the
legacy reader were removed the same day (the 148 reads stem-bench Study 6
measured were the bench's own). A read stored in the old form would align no
bars ("no-bars") and the song-check would still take its text through the
`m<n>` branches `musicXmlSummary` keeps alive.

## The chord chart as the AI's chart (2026-10-24)

Study 4 left the song-check switched off for every song without a score,
and most songs here have a markdown chord chart in the Docs panel and no
engraved notation. So the band's own chart is the third thing
`scoreForAi` can hand the model: after the first ready MusicXML and the
first ready notation attachment, the song's `chartMarkdown` when it has
words in it, as `{kind: "chart", markdown, title}`. `loadScore` passes
the first 12 000 characters as the chart text with `chord: true`, and
`CHART_NOTE` then tells the model what it is reading: the band's
sections and the chords of each, one per bar unless it says otherwise,
no key signatures and no bars, so each part's key comes from the chords
it moves through and its place in the recording from following the
sections. The rest is unchanged: tempo and meter survive the answer only
where the chart states them (`chartStatedAnswer` also reads "120 bpm"
and "♩ = 120", the ways a band writes a tempo), the key is never sent,
and the page's `hasScore` is now "has a score or a chart", so Scan
stems, the upload check and the buttons' titles follow. What is not yet
measured: a chord chart has no bars and the model aligns by ear, so the
key-change placement may be looser than the lead sheet's four seconds;
a stem-bench arm with the markdown chart would tell.

## The chart placed by alignment (2026-10-30)

stem-bench Study 12 (FINDINGS.md) showed that a chart rendered as plain
chord pads at its own tempo and aligned to the recording by dynamic
time warping over chroma places every bar in seconds without a model:
95 % of bar starts within a quarter second on synthetic mixes, every
section boundary within half a second, mid-song boundaries on a real
recording within a tenth; the first and last boundaries are the weak
ones (the chart stops describing the intro and the outro's tail), and a
wrong chart's path cost runs 8.6 to 16.3 times the right one's. The app
now does the same in the browser, from the stems the player already
holds, and uses it in two places: the Sections tab's "Place from chart"
and the song-check's key and tempo changes.

- **Bars from the chart** (pure, `utils/barmarkChartBars.ts`, to
  `ChartBar {measure, chords, bpm, meter, key, section}` plus warnings;
  `measure` is the bar's written number, so a repeat plays a bar again
  under its own). Since 2026-11-03 the band's chart and a notation file's
  stored AI read are both barmark and go through it ("The chart read is
  barmark"; the `utils/chartBars.ts` reader of the old `m<n>` summary is
  gone). Before that the stored read (`m<n> key … tempo … |: :| ending <n>: <chords>`) was expanded in
  play order: repeats and first and second endings were followed, D.S.,
  D.C., coda and fine not (a warning each), a measure the read left
  out held its harmony (`chords: []`), tempo and meter marks applied from
  their measure on with the song's own values before the first, and a
  rehearsal mark or a quoted word that names a section
  (`utils/chartSectionName.ts`: Intro, Verse 2, Pre-chorus, Solo, Outro…)
  starts one. The band's chart is **barmark** (the standard that grew
  out of this app's notation: github.com/kevinpeckham/barmark, the
  `barmark` package, docs/barmark-adoption-plan.md): `parseChart` gives
  the bars in play order with sections, replays (a bare `## Name`
  heading replays that section), `x N`, `|: :|`, `%`, directives and
  one-bar meters already expanded, and the adapter maps each bar's slots
  to symbols that divide the bar equally (a `/` hold repeats the symbol
  before it, `N.C.` and `--` are "N.C.", `?` holds with a warning, a
  `_` group plays its first member), takes the tempo and meter from the
  chart's directives else the song's own, writes the key as "D major",
  and turns every barmark diagnostic into a warning line. It returns
  null with no tempo or no bars. barmark is the only parser: the app's
  earlier in-house one (`chordChartBars`) and the fallback to it retired
  on 2026-11-01, once every stored chart had been migrated (the five
  MMKK charts, three by `scripts/migrate-charts-barmark.ts`, since
  removed, and two by hand). The chart's display is the standard's too:
  `@barmark/render` draws it (docs/styling.md).
- **The query** `chartBarsOf` (songs.remote.ts, members): the song's
  score through `scoreForAi`; the chord chart or a notation file's
  stored read gives `{bars, warnings, source: "chart" | "summary"}`;
  otherwise `{bars: null, reason: "none" | "musicxml" | "unread" |
  "no-bars"}`. It never calls the model: "unread" means the song-check
  has not yet read the file.
- **The aligner** (`audio/chartAlignment.ts`, pure, run in
  `workers/alignChart.worker.ts`; `audio/alignChartInBrowser.ts` mixes
  the player's decoded buffers to mono at the first buffer's rate,
  posts, waits 90 s at most and terminates the worker). The bench's
  math ported: `renderChartPads` sums a sine per chord tone
  (`utils/chordPitchClasses.ts`: root and triad by quality, sevenths,
  sixths, ninths, a slash bass) for each bar's seconds, where a bar is
  the numerator's beats at the bpm and a beat is the meter's bottom
  note, as the song's changes count it everywhere (the bench counted a
  compound meter's dotted beat; a 6/8 song's default tempo would have
  rendered three times too short); `chromagram` folds 55–2200 Hz into
  twelve classes over a Hann window the bench's length in seconds
  (8192 samples at 44.1 or 48 kHz, hop half), L2-normalized;
  `dtwAlign` is cosine-distance DTW with steps (1,1), (1,2), (2,1),
  free start and end in the recording, three cost rows and a byte a
  cell of steps (a ceiling of 150 M cells, about seventeen minutes of
  song), normalized cost and a per-frame step cost. `alignChart` maps
  each bar start through the path and runs the same alignment with the
  reference chroma rotated six classes as the tritone control; a
  four-minute song renders in about a second and aligns in about three.
- **Placements** (`utils/alignedPlacements.ts`, pure): a section at
  each bar that begins one (the first snapped to 0 within a quarter
  second), a key or tempo change at each bar whose value differs from
  the bar before, `ratio = controlCost / cost` and `samePiece = ratio >=
  ALIGNMENT_SAME_PIECE_RATIO && median(localCost) <=
  ALIGNMENT_SAME_PIECE_LOCAL_COST` (constants/chartAlignment.ts). The
  ratio constant is **1.6** since stem-bench Study 14 (2026-10-30): the first
  value, 3, came from synthetic renders where correct charts score 24 to
  49, but on the two real recordings the band's own correct charts
  score 2.04 and 2.53 and another song's chart 1.17 and 1.24, so at 3
  every correct chart read as "not this recording" and everything was
  hedged (the home-field lesson, third appearance: measure on the
  domain production sees). 1.6 is the real-domain midpoint, from two
  songs of one band. The local-cost clause, **0.30**, joined it after
  Study 16 (2026-11-01): with all five charts migrated, one real wrong
  pairing (the Eat All the Clocks recording against the Mop Heart
  chart) scored a ratio of 1.74, over the gate, and only its median
  local cost of 0.323 told it apart; the correct charts sit well under
  0.30. A placement is hedged at the first and last
  sections, in a bar whose local cost is over twice the median (the
  chart stopped matching there) and everywhere when the chart is not
  this recording.
- **The edges, repaired when the chart is this recording** (Study 14's
  arm D). The aligner also reports the recording's first and last
  audible sound (`audibleSpan`: the RMS of 50 ms windows against
  `ALIGNMENT_SOUND_FLOOR`, 2 % of the loudest window's, about 34 dB
  under the peak). When `samePiece`, FIRST-ONSET puts a first section
  that begins at the chart's first bar at the first sound (the bench:
  7.15 s → 0.00 and 2.41 → 0.00 on the two real intros), and
  LAST-SOUND puts the last section at the last sound minus the chart's
  length for that section (`utils/chartBarSeconds.ts`, one copy for the
  renderer and the rule; the bench: a 9.11 s outro miss → 0.03 s), never
  within a bar of the section before. Both stay hedged, and both are
  off when the chart is not this recording, because LAST-SOUND inherits
  the chart's outro length (it would have worsened the song whose chart
  guessed it wrong). Key and tempo changes are not moved by either.
- **On the page.** "Place from chart" beside "Detect" on the Sections
  tab (`utils/sectionsFromPlacements.ts` turns the placements into the
  same answer shape Detect produces, with a note that names the hedges,
  so the existing offer and confirm apply; a song without sections saves
  at once). The song-check runs the alignment after the model answers
  and, when the chart is the recording, replaces the model's key and
  tempo placements with the aligned ones
  (`utils/placeAnswerByAlignment.ts`); a chart that does not fit keeps
  the model's placement and says so. `utils/alignmentReason.ts` is the
  sentence for each reason the chart gave no bars. Nothing here calls
  the model or counts against the AI limit.
- **Not done.** MusicXML (its summary is the same form, but
  `scoreForAi` returns the file; a later pass can read it through the
  same parser), three or more endings, D.S. and coda jumps, a tempo map
  from the alignment itself (the bench's candidates memo), and the
  LAST-SOUND ring-out refinement (a tail section still lands within
  about 1.7 s). Study 14 also confirmed the two
  parsers reproduce the bench's transcriptions bar for bar (76/76,
  86/86) and the summary form to its spec, so the bench can feed them.

## The detected chords checked (2026-10-30)

stem-bench Study 13 measured the chord path on a real recording for
the first time: Basic Pitch and the template matcher, 95.8 % on the
synthetic bench, read 38 % of Letter Lands' bars right against the
chart, the transcription of real timbres (sustained synths, guitar
voicings) being the limit, not the matcher. One text-only pass by the
draft model over the key, each bar's detected chord and its transcribed
note line lifted that to 54 % with twelve fixes and no breaks, for
about a cent a song. Both findings shipped.

- **The pass** (`reconcileChordsWithAi` in server/aiDetect.ts): the
  bench's registered system prompt verbatim (a careful copyist corrects
  the detector only where the notes clearly support it, N.C. for a
  silent bar, plain symbols, JSON `{"chords": [...]}` one entry a bar),
  the same model and adaptive low-effort thinking as the chart draft, a
  16 000-token output cap (every 4 000-token pilot truncated: the model
  narrates before the JSON), logged to `ai_request` as
  `chord-reconcile`. The answer is parsed by
  `utils/parseReconciledChords.ts` (the first `{…}`, a string array of
  exactly the bar count, each symbol trimmed to 12 characters); anything
  else keeps the detector's chords. Remote `reconcileChords` (the draft's
  gates; its own limit of ten an hour) takes the segments and the note
  lines the page already holds, `utils/barChordsOfSegments.ts` lays the
  segments out one chord a bar, and `utils/reconciledSegments.ts` turns
  the answer back into runs with the matcher's confidence per bar and a
  count of bars changed.
- **On the page.** "Detect chords" runs the pass as its last step when
  the AI is configured ("Checking the chords with AI…", cancelable); the
  card then says how many bars the AI corrected from the notes instead
  of the matcher's average confidence, and the draft that follows gets
  the corrected chords as its hints. A failed pass, or one whose answer does not parse, shows
  the detector's chords as before, without a word.
- **The hedge.** The card carries one line, "A rough read: on a real
  recording about half the bars come out right, so check these against
  your ears before you draft or save", and the button's title says the
  same in short. The honest ceiling is the transcription: the next
  investment, if chord drafts matter, is a transcriber that holds up on
  real timbres, not more model.

## The chord model (2026-11-06)

"Detect chords" reads a song's chords from its original mix with ChordMini
first, and from the transcribed stems only when the song has no mix yet.
ChordMini (ptnghia-j/ChordMini, MIT) is a 170-class chord transformer
(ChordNet 2E1D, 24 roots × 7 qualities plus "N" and "X"); stem-bench Study 17
measured it on the band's recordings at 59 of 76 bars right against 29 for
the notes path (44 after the AI check), and found the AI check _breaks_ its
bars (16 right ones), so the check runs only on the notes path.

**On the server, as a job.** `src/lib/server/chords.ts` is the `chords` job
kind (`POST /api/jobs`, like the notes): run by the rendition job after the
mixes it renders (`renderStems`, before the notes), by the `mix` runner after
a mix rendered again, and as a backstop from the song page and the project
page when a member's visit finds chords missing or behind the mix
(`songWantsChords`, `songsWantingChords`: the same rules as the job minus
the claim). The songs nobody opens are caught up from /admin/playback,
"Chord model": a count and a button that posts a batch of forty
(`readMissingChords`, `songsWantingChordsAdmin`). The job claims the song row
(`chords_started_at`, a claim older than `CHORDS_STALE_MS` is taken over),
downloads the mix, decodes it with ffmpeg to float32 mono at 22050 Hz
(`-ac 1`, the arithmetic mean of the channels, which is how the bench's
runner decoded and what the model was trained on), computes the features,
runs the model, and stores run-length frames on the row (`chords_json`,
keyed by the mix's `chords_key`). A song or project marked "no AI" is skipped.

**The features are librosa's CQT, baked.** The reference pipeline is librosa
0.11's `cqt(hop 2048, fmin C1, 144 bins, 24 per octave, norm 1, sparsity
0.01, hann, scale)`, then `log(|CQT| + 1e-6)`. Rather than port librosa,
`src/lib/server/chordmini/cqt-plan.json` holds what its CQT computes: one
early halving of the signal, then six octaves (top first), each an STFT of
512 at that octave's hop with the sparse complex kernel rows for its 24
bins, scale factors folded in. `src/lib/utils/chordminiCqt.ts` evaluates the
plan: a 255-tap Kaiser half-band FIR (`kaiserHalfBand.ts`, `decimateHalf.ts`,
×√2 as librosa's `scale=True`) stands in for librosa's soxr resampler, and
agrees with it on 100 % of chord frames on two real songs. The baked plan
reproduces librosa to 3e-5 on a synthetic signal.
`src/lib/utils/chordminiCqt.fixture.json` is the Python pipeline's answer on
a clip the test regenerates, so the port is checked against the reference
in CI.

**The model runs in a child process** (`src/lib/server/chordmini/infer.ts`,
the notes job's pattern): the ONNX export from Hugging Face
`musetric/chordmini-onnx` (MIT; 17 MB, its SHA-256 pinned in `model.json`,
which carries the bytes as base64 so Vercel's tracer packs it) under
onnxruntime-web's wasm backend, one thread, 16 windows of 108 frames per
run, about two seconds for a four-minute song. The logits are smoothed over
nine frames within each window and argmax'd (`chordminiSmooth.ts`, the
reference's rule), run-length encoded (`chordminiRunsOf.ts`) and spelled as
barmark slots by `harteToBarmark` (`C:min7` → `Cm7`, `C:hdim7` → `Cm7(b5)`,
`N` → `N.C.`, `X` → `?`; until 2026-11-07 the bench's lossy table,
`chart-symbols.json`, see "The chart built from the detections").

**On the page**, `SongChordDraft` asks `songChords` first: stored chords
become one chord per bar by majority vote over each bar's frames
(`chordminiBarChords.ts`, Study 17's registered read), in the shape
`chordsPerBar` returns, so the card, the AI draft and the chart flow are
unchanged. While the mix exists but the model has not read it, the page
waits for the job (polling the query) before falling back to the notes
path. The card says which read it shows (`chordSource`).

**What the model cannot say**: it names roots and plain qualities (major,
minor, 7ths, dim, aug, sus) at the model's resolution, never power chords
or inversions; stem-bench grades it root-level. Study 19's brief
(docs/bench-brief-chordmini-2026-11-06.md) asks the bench to gate the port.
Study 20 (docs/bench-brief-chord-colors-2026-11-07.md, "Result") tried
to color the model's roots from the bar's transcribed notes (power, sus,
slash, a major/minor flip) and every gate failed: on real recordings the
note profiles carry a third or a fourth the guitars never played, so the
colors are unreachable from the notes, and the recoloring cost credited
roots. The model's reading ships uncolored; the hedge on the card stays. Study 20b (the bench, same day) took Study 20's one asset, the power-chord rule alone, to two held-out songs: perfect on dense in-vocabulary power bars, 0 % on a sparse 3/4 arrangement where a played third never reaches the transcription, so it is not shipped either (FINDINGS.md).

**The admin batch's progress** (/admin/playback, 2026-11-07): the posted
batch's ids come back from `readMissingChords`, and `ChordReadProgress`
polls `chordReadStates` every three seconds, each song waiting (no fresh
claim), reading (`chordsStartedAt` within `CHORDS_STALE_MS`) or done
(`chordsKey` is the mix's key), as `chordReadState` reads the columns; a
song seen reading and then waiting again is shown as "did not read" (the
job released its claim). The job reports nothing finer than claim and
done, so a song's bar is empty, pulsing or full.

## Charts and barmark releases

While barmark is 0.x, a minor release may change the grammar, and two of
them have made a chart that parsed clean read differently: 0.20.0 made a
`Coda` with no bar after it an error (it used to play nothing after `To
Coda`, silently) and changed a replay's `->` to cut the bar as written
rather than the last bar played. A stored chart is the band's, so before
a release bumps `barmark`, `bun run db:chart-check` reads every barmark
text on a stage with the installed version, read-only (each song's chord
chart, each score's stored read and each idea's chart), and lists the
ones with an error or a warning (`APP_ENV=preview` for staging; production from
Kevin's machine, like `db:status`). The packages pin each other exactly
(`@barmark/render`, `@barmark/musicxml`, `@barmark/sync` and
`@barmark/midi` each require the barmark minor they were tested with,
since a caret range would not reach a minor), so they are bumped
together, with exact pins in package.json.

## The chart built from the detections (2026-11-07)

`@barmark/sync` (barmark's companion package, 0.1.0; its design is
`docs/superpowers/specs/2026-11-07-detections-to-chart-design.md` in
kevinpeckham/barmark, its API the package README) replaces the lossy path
from detections to a chart. Until today the page voted one chord per bar,
mapped the model's labels through a table (`chart-symbols.json`, where
`min6` became `m` and `X` became `N.C.`), handed the votes to the AI, and
stored its draft without parsing it; every time was thrown away once the
chart existed.

- **Labels** are spelled by barmark's `harteToBarmark` (`C:min6` → `Cm6`,
  `C:hdim7` → `Cm7(b5)`, `N` → `N.C.`, `X` → `?`): the job writes the
  spelling into `chords_json` (`chord`), and `chordminiBarChords` re-spells
  from the stored `label` on read, so rows stored before today read the new
  way without a re-run. The table is gone.
- **Keys** a detector names reach a change or a prompt through
  `utils/barmarkKey.ts`: `printKey(conventionalKey(keyFromText(v)))`
  ("E♭ major" → `Eb`, "G# major" → `Ab`, "C♯ minor" → `C#m`), the form the
  `key:` line and the SongChangeSchema already use; text barmark cannot
  read passes as written.
- **The draft is built, then refined.** `draftChart` calls
  `chartFromDetections` (`src/lib/server/chartBuild.ts`) with the bar grid
  the page computed (the declared tempo's bar starts; alignment's when a
  later step hands them over), the stored model runs (frames and `frameSec`,
  as they are) or the notes matcher's chords as symbol runs, the key and
  meter at 0:00, the sections and the changes. The builder picks each slot's
  chord by coverage, writes `/` holds and `%`, snaps sections to bars,
  writes key, meter and tempo changes as directive lines, spells chords in
  the key in force, and never throws: problems come back as diagnostics (an
  unusable grid gives an empty chart and a 422). **Tempo units:** barmark
  counts grammar 2.1's beat, the dotted quarter in compound meters, while
  SS stores the bottom-number unit, so a 6/8 song at "120" is barmark
  `tempo: 40`. The draft passes no tempo (the builder derives one from the
  grid, which SS made from the declared tempo, so they agree) and converts
  each tempo change by `value × beatsOf(meter) / meter.n`. The AI then
  refines the built chart instead of writing one from votes: it keeps the
  bar count, corrects spellings against the transcribed notes and names the
  sections. Without the AI (not configured, or switched off for the song)
  the built chart is the draft, where before there was a 503.
- **The timing map** is the builder's second output: a `barmark-timing`
  v1 record of when each played bar starts in the recording, hashed to the
  chart it fits (`chart.hash`, FNV-1a 64 over the canonical print), with
  `source` "detected". When the AI's refinement keeps the bar count the map
  is re-hashed to the refined chart; when it changes it the map is dropped
  with a warning on the card. Saving the draft stores the map and the
  builder's confidence record (experimental: a number per bar and slot) in
  `song.chart_timing` and `song.chart_confidence` after `checkTimingMap`
  against the stored text; a chart edit whose hash no longer matches clears
  both. "Place from chart" (the chart aligned to the stems, above) saves the
  alignment's bar starts as a map with `source` "aligned" when the aligned
  score is the band's own chart.
- **The player follows the map when asked** (v0.245.0). A timing map
  converts to the player's `BarGrid` exactly, one tempo segment per bar
  (`utils/barGridOfTiming.ts`: the bar's beats over its span; meters from the
  song's changes; `startAt` the first bar's start; bars counted in recording
  order), and `songGrid(changes, startAt, timing, use)` is the one place
  that chooses between it and the declared tempo's grid. The song page, the
  stem player (readout, click, snapping), the section timeline, the
  song-check and the server's position formatting all take the grid from
  it, so with `song.use_chart_timing` on, every bar line sits where the
  recording's bars are, and a new chord draft is built on those bars (the
  brief's "alignment's bar starts when present"). The switch is **off by
  default** (the click is what plays) and lives in the Tempo & key tab's
  "Bar timing" block, which says where the map came from and how many bars
  it has, with Follow / Stop and Forget; a chart edit that drops the map
  turns the switch off with it.
- **Readouts show written bar numbers** (2026-11-09, stem-shovel issue
  #16). The map keys bars on their play position (`index`), unique across
  repeats and replays, so a grid built from it numbered every readout by
  play position: after a repeat or a D.C. the transport said "9 | 1" where
  the chart says bar 5. `barGridOfTiming` now takes the song's chart text
  and, when the map's chart hash matches it, sets `BarGrid.written` (each
  grid bar's written number, `utils/writtenBarsOf.ts` from barmark's
  `PlayedBar.written`); `formatPosition` prints it and `parsePosition`
  reads a typed bar as a written number (the first pass of a repeated bar).
  Lookups, seeks, section starts and everything stored stay on `index`.
  The draft card's section line maps the draft's own chart the same way.
  When barmark numbers a pickup bar 0 (0.22), the readouts follow with the
  bump; the Studio ruler is the Studio's own grid and is not a chart's.
- **An aligned map is gated on its fit** (`utils/alignmentFit.ts`). On
  Letter Lands (music from 0:00, 132 bpm, a 1.82 s bar) the alignment put
  bar 1 at 8.06 s with half-length bars at the head and ended 15 s early,
  Study 12's weak first and last boundaries, and following that map read
  "-8 | 3" at 0:00. So the alignment's bar starts are kept as the map only
  when bar 1 is within one declared bar of where the sound starts, the
  median bar is within 15 % of the declared bar, and the chart's path cost
  beats the tritone control's by 1.5× or more; otherwise the sections are
  still placed and an info notification says which rule failed. The Bar
  timing block shows an aligned map's agreement ("bar 1 at 0:00, bars
  1.8 s (the tempo says 1.82 s)") so a member sees it before following.
- **The alignment's ends are repaired after the DTW** (stem-bench Studies
  26/26b/26c, `audio/alignmentRepair.ts`). The path is good through the
  middle of a song (0.2 to 0.4 s of the true bars on the MMKK set) and
  bad at both ends (3 to 23 s), whatever the cause (the bench's
  trim-to-drums ablation was ill-posed, so the sparse-intro story stays
  open). The repair leaves the path, its costs and the same-piece gates
  alone and works on the bar starts: (1) the bar period from an onset
  joint comb within ±10 % of the chart's declared bar, which measured
  within 0.02 % on all four songs where the median bar length is
  skew-biased (1.70 s for a true 1.82 s on Letter Lands) and a fitted
  slope 1 % off; (2) the phase from the median residual over the middle
  60 % of bars, a bar trusted when within a quarter period of that line,
  and a refusal when the trusted run covers under half the bars, which
  is what a wrong chart looks like (it caught the bench's own 15-bar
  fixture error on Eat All the Clocks); (3) the trusted span kept as
  aligned, the ends extrapolated at the comb period; (4) each end slid
  by at most a quarter period to the offset that maximizes detrended
  onset energy, the fence that keeps it off the half-bar backbeat (±0.5
  broke Peaceful Dreams' intro by 0.60 s). Measured: Letter Lands' ends
  7.3/15.3 s → 0.05/0.02 s, Peaceful Dreams 6.6/23.3 → 0.06/0.11 s, Mop
  Heart accepted with a 0.32 s outro residual inherited from its own
  middle. `Alignment.barStarts` are the repaired starts, `rawBarStarts`
  the path's own, `repair` the period, the per-bar aligned/extrapolated
  confidence and the slides, null on a refusal, which the fit gate
  reports as the chart not lining up through the middle.
- **Where an alignment's time goes** (Node, a 140 s recording, a 76-bar
  chart): the repair's onset envelope 1.55 s, the recording's chromagram
  0.48 s, the render's 0.45 s, the render itself about 0.4 s, both
  warpings together 0.19 s. The warping is nearly free; the spectral
  analyses are the cost. So the envelope runs in its own worker
  (`workers/alignmentEnvelope.worker.ts`) at the same time as the path
  worker, and `repairAlignment` joins the two on the main thread (the
  comb is milliseconds); the envelope packs two real frames into each
  FFT and takes the magnitude with a square root instead of `hypot`,
  which matches the plain computation to rounding and leaves the
  envelope the bench measured with (22,050 Hz, a 2048 window, hop 256)
  as it is (every frame within 4e-6 of the old values). Letter Lands in
  the browser: 7 s before, about 4.3 s after; the path worker (render,
  two chromagrams, two warpings) is now the long pole. Do not shrink the
  envelope's window to go faster: the repair's numbers were measured with
  it.
- **The grid is re-phased onto the onset lattice** (2026-11-08, stem-bench
  Study 27, recipe v5; `alignmentRepair.ts` `rephaseGrid`): after the
  phase line and the trusted span of recipe v3, the ENTIRE uniform line
  slides once onto the onsets by `combSlide`, fenced at ±0.5 beat
  (`REPHASE_FENCE_BEATS`, the bar over the meter's beats,
  `utils/meterBeats.ts`), and every bar ships on the slid line; a bar's
  confidence is "aligned" where the warping's own start agrees within a
  quarter bar, else "re-phased". The bench found the warping's middle
  carries a coherent sub-beat phase offset at fast tempos (Mop Heart, 224
  bpm in 3/4: 0.38 s against the adjudicated anchor), which v3's ends-only
  repair copied; the onset lattice, not the warping's phase, is where the
  notes are. Half a beat reaches that and never the neighboring beat.
  `Alignment.repair` is `{ period, confidence, delta, rephased }`; the
  refusal (null, the wrong-chart detector) is unchanged. `repairEnds`
  stays as the v3 reference. **The envelope's lead**: `onsetEnvelope`
  stamps a frame at its window's start, so a hard onset reads about 70 ms
  early (measured, constants `ONSET_ENVELOPE_LEAD_SEC`); v3 never showed
  it, v5 would have put every bar there, so `repairAlignment` adds the lead
  back. On the pad fixture the re-phased starts sit within 25 ms of the
  truth, mean within 15 ms, where the uncorrected line sat 70 ms early.
  The bench measured Study 27 through the same envelope: its 50–70 ms
  residuals on the real songs are this lead (docs/bench-brief-v5-backbeat-2026-11-08.md
  tells it so).
- **The recording's features are cached per song in the browser**
  (2026-11-08, `audio/alignmentFeaturesCache.ts`, IndexedDB
  `stem-shovel-alignment`): the mix's chromagram (flattened, 12 a frame),
  its audible span and its onset envelope depend on the stems alone, not
  the chart, so a second "Place from chart" after a chart edit skips them.
  The key (`utils/alignmentFeaturesKey.ts`) is `af1:<rate>:<the source
  renditions' mediaCacheKeys, sorted>`: pathnames are never reused, so the
  set names the audio, and `af1` is the feature code's version, bumped
  when `chromagram`, `audibleSpan` or `alignmentEnvelope` change what they
  compute. On a hit the path worker takes `features` and no recording, the
  envelope worker is not started and the mono mix is not made; a record at
  another rate is a miss; at most 24 records, the oldest written going
  first; the house browser-cache contract (never throws, a failure is a
  miss or a no-op). Letter Lands in the browser: 4.8 s on a miss, 3.4 s
  on a hit; what remains is the chart's render, its chromagram and the two
  warpings.
- **The saved draft is canonical**: `saveChartDraft` parses the text and
  stores `printChart`'s output when it parses without errors, as the editor
  normalizes; a draft with errors is stored as written and its diagnostics
  shown.
- **Chord typesetting** in the documentation PDF comes from
  `@barmark/render`'s `typesetChord` and `glyphs` (exported since 0.16.0);
  the app's copies (`utils/typesetChord.ts`, `utils/accidentalGlyphs.ts`)
  are gone.

## The chartless grid: bar one from the stems (2026-11-08)

A song with no chart drafts its chords on a bar grid, and until today that
grid was the declared tempo (often the detector's rounded value) counted from
`startAt`, or from 0:00 without one. stem-bench Studies 28 to 31c measured
what the stems alone can say about that grid and what they cannot:

- **The lattice is exact; the downbeat is one bit.** The onset comb's bar
  period (`jointOnsetComb`, the same comb the alignment's repair uses)
  measured within 0.02 % of the truth on four real songs, the beat lattice
  sits on the notes, and the song's length comes out within one bar. The
  one thing the comb gets wrong is which lattice beat is bar one: its own
  bar-phase landed on the backbeat on two of four songs (Study 28), and
  three cheap scorers tried next (chroma novelty, kick-band onsets, raw
  comb phase) never earned the right to overrule it (Study 30).
- **Three witnesses do** (Studies 31/31b/31c, `audio/chartlessGrid.ts`).
  _Time zero_: a DAW bounces from a bar line, so 0:00 snapped to the
  nearest lattice beat votes for that beat's class when it is within a
  quarter beat (on the bench the distance was 0.06 to 0.08 s on every song,
  the onset envelope's lead, so the lattice is lead-corrected first;
  `ONSET_ENVELOPE_LEAD_SEC`). _Harmonic rhythm_: the chord model's stored
  runs voted per beat, the changes between consecutive beats counted by
  beat-in-bar class; the class with the most changes votes (4 of 4 on the
  bench, margins from 19 vs 14 to 46 vs 11). _Section scale_: beat-
  synchronous chroma through a checkerboard novelty kernel at 8 and 16
  beats, the peaks counted by class (4 of 4). Crashes and a drum-stem
  witness were measured too and dropped (1 of 4; the stem witness vetoed
  itself).
- **The vote** is the bench's registered one: weights 2, 2 and 1, decided
  when the top class scores at least 2, leads the runner-up by 1 and the
  comb's own class by 2 (or is that class); the chord witness abstains
  unless its top class holds 1.2 times the runner-up's changes (the rule as
  the bench's validated run applied it, Study 32). Undecided means no
  placement: the draft keeps the declared grid as before.
  With the vote the bench's chartless drafts reached the chart-informed
  reference exactly on Letter Lands (94.7 %) and above it on Peaceful
  Dreams (99.3 %), where the comb's own class had them at 81 % and 61 %.
- **Bar one contains the first sound** (Study 31c). A class names a
  position modulo one bar, and the wrong representative put bar one a whole
  bar late and collapsed the drafts; the placed bar one is the class's last
  lattice point at or before the first audible sound plus a quarter beat.
- **The member's start wins.** A song whose "Start of bar 1" is set skips
  the vote: the lattice's exact period, bar one at the lattice beat nearest
  the start. A song with more than one tempo or meter, or a tempo ramp, is
  not placed (the comb assumes one period).
- **Where it runs.** "Detect chords" (`state/songChordDraft.svelte.ts`) gets
  the model's chords first, then places the grid in the browser
  (`audio/chartlessGridInBrowser.ts`, the worker plumbing both readings
  share in `audio/alignmentWorkers.ts` and `audio/monoOfBuffers.ts`): the
  recording's chromagram, audible span and onset envelope come from the
  alignment features cache when it holds them, else from two workers
  (`workers/alignmentEnvelope.worker.ts` and the new
  `workers/recordingFeatures.worker.ts`), and the record is written so a
  later "Place from chart" is a hit. Cancel aborts the workers. In streamed
  mode this is the step that fetches and decodes the stems. The chords are voted on
  the placed bars, the draft and its timing map are built on them
  (`draftChart`'s `grid`), and the detected-chords card says where bar one
  landed and which witnesses agreed (`utils/chartlessPlacementLine.ts`).
  Nothing that plays changes: the map follows the existing switch, off by
  default. Any failure in the placement falls back to the declared grid.
  A bar one the vote puts before 0:00 is clamped to it (the draft's grid
  takes no negative time), a short pickup bar.
- **Letter Lands on dev** (2026-11-08): period 1.8182 s (132 bpm exactly),
  the comb's own phase on beat four, all three witnesses for the same
  class (time zero 0.034 beat off, chord changes 22 against 13, 12 and 7,
  sections 22 of 24 peaks), bar 1 at +0.015 s where the v5 chart placement
  had +0.022 s, 78 bars to the end of the audio, 5 s on a cache hit. In
  DEV the result is on `window.__chartlessGrid`.
- **"Use as start of bar 1"** (2026-11-08). A placed grid can become the
  song's own: the button under the placement line writes bar one into the
  song's "Start of bar 1" and the lattice's tempo (60 × beats per bar ÷
  period, to two decimals) into its tempo change, in one command
  (`useChartlessGrid` in `remote/songs.remote.ts`, the values from
  `utils/chartlessGridUse.ts`), then the page's data is read again. Nothing
  happens unless the member clicks: the vote proposes, the member decides,
  and the next "Detect chords" skips the vote and places from the member's
  start (`byStart`).
- **"Generate chart from the stems"** (2026-11-08): the empty Chart tab's
  one-click run (`SongChordDraft.generateChart`, one Effect program in the
  class's fiber, so Cancel interrupts it at any step): the page's
  `ensureGrid` (Scan stems, which saves on a song with no rows) when the
  song has no grid; `#detect` (chords and placement); a decided placement
  written as the song's start of bar 1 and tempo (`useChartlessGrid`, a
  failure said and skipped); `#draft`; then the draft's sections at the
  placed bars' starts (only when the song has none) and the chart with its
  timing map (`saveChartDraft`, `replace: false`), the draft cleared and
  the page's data read again. The Docs panel shows the step (`progress`)
  with Cancel; the final notification is `utils/generatedChartLine.ts`.
- **Refusals are values** (2026-11-09). `chartlessGrid` answers with a
  result: the grid, or a refusal with its reason and the witnesses'
  readings (`no-input`, `undecided`, `no-fit`; the browser wrapper adds
  `unavailable` for no workers, no audio, a failure or a timeout). The
  draft state keeps the refusal beside the placement
  (`placementRefusal`), and `chartlessPlacementLine` says it on the
  Tempo & key tab: for an undecided vote, what each witness read ("the
  chord changes say beat 3, the recording's start says beat 1, the
  section changes abstain") and that the bars follow the song's own
  tempo and start. The grid's chord input is `@barmark/sync`'s
  `ChordRuns`, which the stored `ChordminiRuns` already fits;
  `chordminiBarChords` reads either, runs in seconds included. Both are
  the contract `@barmark/listen` will carry (stem-shovel issue #17).
- **The verdict before an unattended save** (2026-11-09,
  `utils/generatedChartVerdict.ts`). "Generate chart from the stems" no
  longer saves whatever the draft step returns. The draft is **held** on
  the draft card, with one notification saying why and nothing saved,
  when the run set the song's tempo and time signature from the stems
  itself (a song that had none; see below), when it carries an error
  diagnostic, when its timing map was dropped (the refinement changed
  the bar count), or when more than half its bars have no chord the
  model could name (`?` or `N.C.`; `GENERATED_MAX_UNKNOWN_SHARE`, a
  provisional floor no study has measured yet). It is saved **with a note** in the notification when the
  vote left bar 1 unplaced or the chart carries warnings. A held draft
  keeps its Save as chart and Discard, so nothing is thrown away.
- **Why a detected tempo holds the draft** (2026-11-09, stem-bench
  Study 34). Twelve recordings from outside the band went through this
  path with every prior detected: five of the eight graded drafts were
  confidently wrong, and every one was wrong at the grid, from the
  detector's tempo level, meter or key (a waltz read as 4/4, a blues at
  half tempo). The draft step kept each wrong grid's bar count, so the
  dropped-map hold saw none of them. A wrong tempo is the one error the
  draft cannot show, so the run that detected it does not save
  unattended: the member checks the tempo and time signature the run
  just set (Tempo & key), then saves the draft from its card. The hold
  is the run's alone: the song records no source for its tempo, so a
  later Generate on the same song saves as before. Study 34b
  (`docs/bench-brief-study34b-declared-priors-2026-11-09.md`) measures
  whether the detector's own confidence could narrow this.
