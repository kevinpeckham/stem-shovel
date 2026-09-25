# Recording demos in the app

Status: **Phase 1 built** (2026-09-18); the rest of this page is the plan
it came from, with what shipped marked. Kevin's use case: someone sits down
with a guitar and a phone and records a demo with start, stop, pause, undo
(retake), save and delete.

## Ideas and takes (2026-09-18)

The model settled on after a day of use: an **idea** is a title, one
markdown note board and one or more **takes** (audio recordings, numbered
within the idea, each with an optional name). Ideas are the user's own
within the account; other members do not see them until a take is added to
a song (a share feature may come later). On `/[account]/ideas/recorder`:

- **Record → Stop** completes a take and hands it to a background upload
  queue (`src/lib/audio/takeQueue.svelte.ts`): Record is available again
  at once, the take stays loaded for playback (Play, a volume slider, the
  ⋯ menu with Download and Delete take) and gets its number when the
  upload lands. Uploads run one at a time in recording order, so the
  server's numbers follow the order the takes were made; an Uploads strip
  under the recorder shows progress with Retry and Discard on failure.
  Every pending take is written to IndexedDB (`stem-shovel` /
  `pendingTakes`) before upload and removed after, so a refresh, a crash
  or a phone switching apps resumes it on the next visit (an idea that was
  never created gets one with the title it had). Measured in Chromium:
  Stop to Record enabled in about 70–105 ms. No pause, no review step.
- **New idea** (the header button or the recorder's ⋯ menu) starts a fresh
  one ("Untitled Idea N", editable at the top of the recorder) with an
  empty note board; the idea row is created on first use (a take or
  notes; a title alone never saves one) and **removed again when nothing
  is left in it** (`deleteIdeaIfEmpty` after the last take, after the
  notes are cleared, after a discarded upload; `deleteEmptyIdeas` sweeps
  hour-old empties when the page loads). The note board is the song
  documents' embedded markdown editor, always in edit mode with autosave,
  Escape or ⌘S saving at once, and a trash button to clear it
  (`IdeaNotesPanel.svelte`, `saveIdeaNotes`).
- **Take names** go in the field beside the "Take N" label before, during
  or after recording: with no take loaded the field names the next take,
  and a name typed mid-take goes out with it. Starting a take from a
  loaded one clears the field.
- **The list** under the recorder shows the user's ideas newest first as a
  plain accordion (a click on the name only folds or unfolds; the open set
  is page state and the native toggle is cancelled, because a toggle event
  landing after an autosave re-render fought it); clicking a take loads it
  and its idea's title and notes come with it; each take has a menu (Add
  as demo…, Create new song…, Delete take) and each idea one (Delete idea;
  deleting an idea other than the loaded one leaves the player alone). An
  idea unfolds when its take lands or when it is picked from Search or the
  phone picker. **Search** is a sheet (full screen below `sm`) listing
  every idea as an accordion, filtered as you type by title, notes, take
  label or number (`filtered` in the page); ideas whose takes matched open
  on them. With more than one take in the idea, the loaded
  take's "Take N" label is a dropdown listing every take (number, name,
  length) for a quick jump. On a phone the notes come right after the
  recorder so both are in view and the list gives way to a `ComboBox` of
  the ideas above the recorder.
- **Fidelity** (2026-09-19). The codec ladder in `recordingMimeType.ts`:
  lossless where the browser can (ALAC in MP4 on Safari 18.4+, raw PCM in
  WebM on Chrome and Edge 135+), else Opus or AAC at 256 kbit/s; a Quality
  setting drops to compressed for a metered connection. Capture asks for
  48 kHz and one channel (two with the Stereo setting) and a chosen
  microphone (`deviceId`; the settings list inputs after one permission
  grant), and the line under the meter reports what the track and the
  recorder really gave ("ALAC lossless · 48 kHz · mono"), since Safari is
  known to ignore some requests. Chrome's raw PCM is turned into FLAC by
  the jobs function before the MP3 rendition is made (`isRawPcm` +
  `replaceRecordingSource` in transcode.ts; the row's url, pathname,
  filename, content type and size follow, the WebM is deleted; on the VM's
  dev server the jobs self-call goes to localhost, since the proxy origin
  cannot be called back); Download Source of a take still in raw PCM (just
  recorded, or saved and not yet converted) decodes it in the browser and
  hands over a 16-bit WAV (`utils/encodeWav.ts`), a file any player or DAW
  opens; ALAC stays
  as recorded. **Playback prefers the original**: the take's codec is
  stored at reservation (`recording.codec`, migration 0042) and the
  recorder asks `canPlayType` (`playbackMime.ts`) before choosing the
  original over the MP3 rendition, so the device that recorded a take
  hears it lossless, a Mac plays an iPhone's ALAC, everything plays FLAC,
  and Chrome facing ALAC gets the MP3; a media error on the original
  falls back to the rendition. A take just made plays the browser's own
  blob until the page sees its rendition (`followRendition` polls for a
  minute, `refreshUrl`). Downloads always hand over the original.
  Preferences live in `recorderPreferences.ts` (localStorage). The byte
  cap is 120 MB (`MAX_TAKE_BYTES`).
- **Ceilings** (`src/lib/constants/takeLimits.ts`, `takeStopReason`): the
  recorder's 100 ms watch stops a take at `MAX_TAKE_SECONDS` (15 min; a
  notice at 10) and after `SILENCE_STOP_SECONDS` (2 min) of input under
  `SILENCE_LEVEL` (meter level 0.01, about -50 dBFS), saving it when it ever
  had sound and discarding it when it never did; the level is sampled in
  the watch timer as well as the meter's animation frame, since a
  background tab throttles frames but keeps timers. The reservation
  (`POST /api/recordings`) and the upload token refuse more than
  `MAX_TAKE_BYTES` (120 MB since lossless takes; a compressed take never
  comes near it). Phones stop the microphone themselves when the app
  leaves the front.
- **Recorder settings** (the gear in the header, a popover): "Discard takes
  shorter than 3 seconds automatically", off by default (it throws a take
  away), per browser
  (`src/lib/utils/discardShortTakes.ts`; the recorder's `minTakeSeconds`);
  "Trim silence at the start and end", off by default
  (`recorderPreferences.trimSilence`). The flag travels with the take's
  reservation (`recording.trim_silence`, migration 0046) and the jobs
  function honours it when it renders the MP3: a `silencedetect` pass
  (−40 dB, gaps of 0.3 s or more; `src/lib/utils/silenceBounds.ts` reads
  the log) finds the first and last sound, the source is cut to 0.3 s
  before the first and 0.5 s after the last (re-encoded to the sample for
  ALAC, FLAC and raw PCM, stream-copied at the packet for Opus and AAC) and
  stored under a new pathname, the MP3 is made from the cut source so both
  have the same length, `duration_seconds` is set from the cut and the
  flag cleared so a retry cuts nothing twice. Less than 0.1 s to gain, or
  a take that is silent throughout, is left as recorded
  (`src/lib/constants/trimSilence.ts`).
- **Tuner** (`Tuner.svelte`, a popover from the header and the public
  `/tuner` page): `src/lib/audio/pitch.ts` reads the pitch of a 4096-sample
  window twenty times a second with McLeod's normalised square difference
  (tested on synthesized strings within a cent), `constants/tunings.ts`
  lists the tunings, `utils/tunerPreferences.ts` remembers the tuning and
  A4. It opens the microphone with the recorder's constraints and audio
  session; a take starting hides the popover, which stops it.
- **Reusable bits** that came out of this page: `ComboBox.svelte` (a
  trigger with `popovertarget` opening a listbox that is a native popover,
  placed under the trigger by CSS anchor positioning through the invoker's
  implicit anchor, `position-area`; keyboard complete with
  `aria-activedescendant`; `bind:openState` lets a parent open or close
  it), `ContextMenu.svelte` (a ⋯ button opening a popover menu of actions,
  links or snippets the same way, `position` picks the corner) and
  `InfoTip.svelte` (an info button opening a native popover placed under
  it; tap or click, not hover, so it works on a phone). Browsers without
  anchor positioning get `utils/anchorFallback.ts`: `placePopover` sets
  fixed coordinates through element styles, which a strict CSP allows and follows scroll and
  resize until the popover closes. Their component tests give jsdom a small
  popover stand-in (`ComboBox.svelte.test.ts`).
- **Into a song**: "Add as demo…" and "Create new song…" in the recorder's
  ⋯ menu and in each take's menu open one popover (`RecordingActions.svelte`
  in add or new mode); "Merge the idea's notes into the song's notes"
  (default on) appends them as a new version of the song's notes document
  under a heading naming the idea and take (`mergeIdeaNotesIntoSong`).
- Takes are `recording` rows (`idea_id`, `take_number`, `title` = take
  name); migration 0041 made one idea per earlier recording. Remote
  functions: `ideas.remote.ts` (create, rename, notes, delete, render) and
  `recordings.remote.ts` (take name, delete, add to a song, new song).

## What shipped (Phase 1)

- **Scratch recordings, not demos.** A take goes into the account's library
  (`recording` table, `accounts/<id>/recordings/<id>.<ext>` in the private
  store when one is configured, else the public one) as a riff, a lick, a
  melody idea or a whole take. It becomes a demo only when a member adds it
  to a song: the file and its MP3 are **copied** under the song
  (`copyRecordingToSong`), so the recording stays in the library and the
  demo lives and dies with the song. "New song from it" creates the song in
  a project and adds the recording as its first demo.
- **Pages** (as of Phase 1; the library page is gone since "Ideas and takes" above). `/[account]/ideas/recorder` is the idea recorder ("Idea Recorder" in the app) (members only;
  `?song=<id>` remembers the song it was opened from and offers "Add to
  that song" first); `/[account]/ideas/recordings` is the library (play, rename,
  download, add to a song, delete). Both are in the account menu; the song
  page's Uploads menu and empty player box link to the recorder.
- **The recorder** (`DemoRecorder.svelte`): one take with Record, Pause /
  Resume (`MediaRecorder.pause()`), Stop, Undo (retake) and Save; a clock,
  an input level meter with peak hold (an `AnalyserNode`, not connected to
  the output), the input's name, a screen wake lock while recording, and
  the voice processors (echo cancellation, noise suppression, auto gain)
  off. A track that ends mid-take (a call) keeps what was recorded. Saving
  reuses the demo upload path: `POST /api/recordings` reserves,
  `/api/upload` issues the token (recording pathnames are routed to the
  recording store), `/api/recordings/[id]/ready` reports the URL and the
  timed length, and the same ffmpeg step as demos makes the MP3
  (`scheduleRecordingPlayback`).
- **Notes** (2026-09-18): a markdown notes field per recording, edited in
  the song documents' embedded editor. On the recorder page the panel is
  open before any take (two columns like the song page: recorder left,
  notes right); the draft travels with the reservation (`POST
/api/recordings` takes `notes`) and autosaves to the server once the
  recording exists (`RecordingNotes.svelte`, `saveRecordingNotes`). Each
  library row has the same editor in a collapsible section.
- **Headers.** Permissions-Policy allows `microphone=(self)` and
  `screen-wake-lock=(self)`.
- Verified end to end in Chromium with a fake microphone fed by the test
  WAV (record, pause, resume, stop, save, new song with the demo, library).
  Not yet tried on an iPhone.

Not built yet (Phase 2): segments with undo of the last one, crash
recovery from IndexedDB, the server-side join, count-in, play-along, trim.

## What already exists

- A demo is any audio file per song (`demo` table, up to 12 per song,
  `MAX_DEMOS_PER_SONG`); the browser reserves it (`POST /api/demos`), sends
  the bytes straight to Vercel Blob (`uploadDemoFile` in `src/lib/upload.ts`)
  and reports the URL (`/api/demos/[id]/ready`). The server then transcodes
  every demo to MP3 for playback (`scheduleDemoPlayback` in
  `src/lib/server/transcode.ts`). Delete is the `deleteDemo` form.
- The accepted formats (`src/lib/constants/demoFormats.ts`) already include
  what browsers record: `audio/webm` (Chrome, Firefox: Opus) and `audio/mp4`
  (Safari: AAC). **A recording is just one more demo file; the storage and
  playback path needs no change.**
- The CSP already allows `blob:` in `media-src` and `worker-src`, which a
  recorder needs for local playback of a take and for audio worklets.

The one blocker: the Permissions-Policy header
(`src/lib/constants/securityHeaders.ts`) sends `microphone=()`, which turns
`getUserMedia` off for the whole site. It has to become `microphone=(self)`
(and `screen-wake-lock=(self)` for the wake lock below).

## The recorder

One component, `DemoRecorder.svelte`, opened from the Demos panel of song
settings and from the Uploads menu ("Record demo"); on a song without stems,
the empty player box also offers it. On a phone it is a full-screen popover
like song settings, with big controls; on a desktop, a card.

State machine: `idle → recording ⇄ paused → reviewing → saving → done`.

| Control        | Does                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start          | Asks for the microphone (first time), starts a take. A 3-2-1 count-in is optional (below).                                                                          |
| Pause / Resume | Ends the current segment; Resume starts the next. Segments are joined on save.                                                                                      |
| Stop           | Ends the take and shows it for review: play it back, see its length.                                                                                                |
| Undo (retake)  | Drops the last segment (while recording or paused) or the whole take (while reviewing) and goes back to recording or idle. Asks when it is more than a few seconds. |
| Save           | Names it ("Recording 17 Sep 21:15", editable), uploads it as a demo through the existing path, closes.                                                              |
| Delete         | The existing Remove on the demo list; a saved recording is an ordinary demo.                                                                                        |

While recording: elapsed time, a level meter (an `AnalyserNode` on the
stream; peaks in red), and a "keep the screen on" wake lock so the phone
does not sleep mid-take. No monitoring through the speaker (feedback).

### Capture

`navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false,
noiseSuppression: false, autoGainControl: false, channelCount: 1 } })`. The
three "voice" processors are on by default and ruin a guitar (pumping,
gated sustain); browsers honour the request on desktop and, from iOS 15,
on the phone, though Safari still applies some processing of its own.

`MediaRecorder` on that stream, one recorder per segment
(`start()` … `stop()`), with a 1 s `timeslice` so chunks arrive as it goes.
Chrome and Firefox produce Opus in WebM; Safari produces AAC in MP4. Both
are demo formats today. `MediaRecorder.pause()` exists, but segment-per-
recorder is used for Pause anyway because it is what Undo needs and it
side-steps the browsers' uneven pause support.

Segments are kept in IndexedDB as they arrive (song id, segment index,
blob). A refresh, a crash or a phone call (which stops the microphone on
iOS) leaves the take recoverable: on reopening the recorder it offers
"Continue the take from 21:15 (2:34)" or discards it.

### Save

Several segments become one file. Two options:

1. **Server-side join** (recommended): upload the segments as they are,
   under one reservation (`POST /api/demos` gains `segments: n`, the
   pathnames get `-1`, `-2` …), and the transcode step joins them with
   ffmpeg's concat demuxer before making the MP3 (same codec, no re-encode
   of the join). The _source_ demo stays a set of segment files (download
   gives the MP3). About 60 lines in `transcode.ts` and the reservation.
2. Client-side join: decode every segment with Web Audio, concatenate the
   samples and encode a WAV. Lossless and simple, but a 5-minute mono take
   is 25 MB of WAV over a phone connection, and decoding is slow on old
   phones. Fine as a fallback for a single segment (no join needed: upload
   the blob directly, which is also the v1).

**v1 is one segment**: Start, Pause/Resume via `MediaRecorder.pause()`,
Stop, Retake (discard all), Save, Delete. That is a day's work including
the header change, the wake lock and the level meter. Segments with Undo
of the last one, crash recovery and the server-side join are the second
day. The count-in and play-along are later.

### Quality

A demo recorded on a phone is AAC or Opus at the browser's default rate
(Safari about 64 kbit/s AAC, Chrome 128 kbit/s Opus), transcoded to MP3
for playback: lossy to lossy, audibly fine for a memo, not for a stem. A
lossless option (capture PCM in an `AudioWorklet`, encode FLAC client-side)
is possible later if recordings should become stems; it costs a worklet,
an encoder and the WAV-sized uploads above.

## Later, if wanted

- **Count-in and click** from the song's tempo and meter (Web Audio
  oscillator ticks). Through the speaker they bleed into the take, so the
  click is offered only with headphones detected (`enumerateDevices` shows
  no way to know; ask instead).
- **Play along**: the song's stems or an existing demo in the headphones
  while recording, the new take aligned to the song's start. The stem
  engine can play; the alignment is the recorder start latency (~100 ms on
  a phone), which can be measured once with a loopback and stored.
- **Input choice**: an external interface over USB-C (`enumerateDevices`,
  `deviceId` in the constraints), and stereo when it offers it.
- **Trim** the head and tail before saving (silence while reaching for the
  phone): a two-handle range on a waveform of the take, applied server-side
  with ffmpeg `-ss`/`-to` so the join and the trim happen in one pass.

## Phone realities to design around

- iOS records only while Safari is in front and the screen is on: the wake
  lock (Safari 16.4+) keeps the screen on; leaving the tab stops the take,
  which is why segments are persisted as they arrive and the take is
  recoverable.
- An incoming call takes the microphone; the recorder must survive an
  `ended` track (finish the segment, tell the user, offer Resume with a
  fresh stream).
- Safari's default input processing cannot be fully switched off; a
  guitar still sounds like a guitar, a loud strum may be tamed.
- The first `getUserMedia` prompt appears once per site; a denial is
  permanent until the user changes it in Settings, so the recorder must
  say so plainly.
- Bluetooth headsets switch the input to the headset microphone (worse
  than the phone's). Say which input is in use.

## Testing

Chromium can fake the microphone for Playwright:
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
--use-file-for-fake-audio-capture=<wav>`, which plays a WAV as the input.
An end-to-end test can record the static test loop, save it and check the
demo appears with an MP3 rendition. iOS Safari needs a real phone: Kevin.

## Not in scope

Multitrack recording, overdubs on stems, effects, and editing beyond a
trim. Those turn the app into a DAW; the demo is a memo.
