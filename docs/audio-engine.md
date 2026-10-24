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
  the blocks sit over the waveforms, labeled with the section's `index`
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
  song's time scale (same seek and keyboard behavior), and back. The file
  is fetched from Blob and parsed in the browser once per URL — a small
  SMF reader that merges tracks, follows tempo changes and keeps note
  on/off only.
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
  doubled as the likely root) matched against chord templates (major,
  minor, 7, maj7, m7, sus4, 7sus4, sus2, dim, aug, 5); a chord rooted on
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
  repeats and endings, chord symbols after a colon. The text is cached
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
- **Tempo and meter only where the chart states them.**
  `chartStatedAnswer` (`src/lib/utils/chartStatedAnswer.ts`) nulls the
  answer's tempo (and empties `tempoChanges`) unless the chart's summary
  carries a `tempo <bpm>` mark, and nulls the meter unless it carries a
  time signature; without a summary (a PDF the reader could not write
  out) only the keys survive. `AiAnswer.meter` is therefore nullable.
  On the page a null writes no row and, for tempo, leaves the song's
  later tempo rows alone; the card and the notification print only what
  the chart said.
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

- `utils/chartReadWarnings.ts` reads `readChartWithAi`'s summary for the
  reader's own "Note:" lines (an unreadable page, a doubt it voiced
  unprompted) and for the dropped-accidentals signature: a key signature
  of two or more sharps or flats while none of eight or more chord symbols
  carries any (one accidental is no evidence: a song in G major can go
  pages without an F♯; a flat on a slash bass counts).
  `keySignatureSharps` maps majors and minors to their signatures.
- `askAiAboutMix` runs it on a read score (never on the band's own chart,
  which is not a read) and returns the lines as `AiAnswer.warnings`.
- The song page shows them in amber on the AI card, and `askAiWithScore`
  (the check that follows a score upload) no longer applies a doubtful
  answer to the song's settings unasked: it notifies with the first
  warning and leaves the card for the user to judge, "Use these" still a
  click away. A clean read behaves as before.

Left: showing the read itself (the per-measure summary) for correction
before it anchors the check, which Study 5 recommends; the read is cached
by the file's URL, so a corrected read would need a place to live.

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
