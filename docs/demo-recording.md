# Recording demos in the app (plan)

Status: **plan only, nothing built** (2026-09-17). Kevin's use case: someone
sits down with a guitar and a phone and records a demo with start, stop,
pause, undo (retake), save and delete. Nothing more.

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
