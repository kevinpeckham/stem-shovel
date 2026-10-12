# Streaming stem playback: a plan

Kevin, 2026-10-12, after the cap of 32 stems a song was lifted: "Curious
if there's a WASM-approach that would potentially bypass the browser
memory limits for stem playback?" Then: "plan it out and come back with
questions".

## The problem

The player (docs/stem-engine.md) decodes every stem to Float32 PCM at
32 kHz for its whole length and keeps it: about 61 MB per four-minute
stereo stem, 490 MB for eight, a gigabyte for sixteen. A phone's tab is
killed somewhere between one and three gigabytes (WebKit's threshold is
the smaller of 3 GB, the device's RAM and the jetsam limit, and it decays
with uptime), and nothing in the page learns of it except the marker the
engine now leaves behind. Wasm memory is the same tab memory, so a wasm
decoder bypasses nothing; what changes the picture is not holding the
decoded song at all.

## The design: decode a window, mix in one worklet

Two modes behind the one `StemEngine` API, chosen at `load()`:

- **Buffered** (today): fetch, `decodeAudioData`, AudioBufferSourceNodes,
  instant seek, full buffers for analysis. Stays the mode for songs under
  the device's budget and for browsers without the decoder below.
- **Streamed** (new): the compressed rendition is the only whole thing
  held; a worker decodes a window around the playhead and hands it to
  one AudioWorkletProcessor that mixes every stem against a single
  sample counter.

### The pieces

1. **Source.** Each stem already has an AAC-LC rendition in an `.m4a`
   written with `+faststart` (`src/lib/server/transcode.ts`), at 48 kHz,
   mono or stereo. Vercel Blob answers Range requests (`206`,
   `accept-ranges: bytes`, CORS `*`) on the public store, and a private
   song's stems reach the browser as presigned Blob URLs good for twelve
   hours (`PRESIGN_TTL_MS`), so the same Range path serves both. The
   demuxer reads the `moov` index with one small range, then only the
   access units it needs.
2. **Demuxer: mediabunny** (MPL-2.0, TypeScript, tree-shakable, maintained
   by the mp4-muxer author). It reads the `esds` AudioSpecificConfig into
   a WebCodecs `AudioDecoderConfig`, gives access units with timestamps
   (`EncodedPacketSink`), applies the edit list that carries the encoder's
   1024-sample priming, and its `UrlSource` does the Range fetching with
   prefetch and retry. mp4box.js would do, but hands back raw boxes.
3. **Decoder: WebCodecs `AudioDecoder`** with `mp4a.40.2`: Chrome and Edge
   94+, Firefox 130+ on desktop, Safari 26+ on every Apple platform.
   Platform decoders, hundreds of times realtime. Always pass the
   AudioSpecificConfig as `description` (iOS refuses ADTS), feed one
   access unit before a seek target and drop its 1024 samples (AAC frames
   overlap), normalise output with `copyTo(…, {format: "f32-planar"})`
   since WebKit emits interleaved. `isConfigSupported` is not to be
   trusted; a failed first decode is the real test and drops the song to
   buffered mode.
4. **Worker.** One dedicated worker owns the demuxers and decoders for all
   stems, keeps each stem's window filled (ahead of the playhead and a
   little behind, see the question on size), and posts decoded chunks to
   the worklet as transferred `Float32Array`s with their absolute sample
   position. No SharedArrayBuffer: that needs cross-origin isolation, and
   Safari lacks `credentialless`, so `require-corp` would have to cover
   every font, script and Blob fetch and would sever the OAuth and
   passkey popups that use `window.opener`. Transferred chunks with a
   few hundred milliseconds of lead are enough for playback; a ring
   buffer over SAB stays the escape hatch if jitter demands it.
5. **Worklet: `static/worklets/stem-mixer.js`.** One processor, one
   sample counter. Each stem has a queue of chunks and a target gain;
   each quantum sums `gain × chunk` for every stem whose chunk covers the
   counter, ramps gains over 15 ms as the GainNodes do now, and posts a
   low-water message per stem so the worker refills. Sample-locked by
   construction, as the current `start(when)` scheme is. The master gain
   and the limiter stay native nodes after it.
6. **Transport.** `play()` primes: the worker decodes from the playhead
   and the counter starts only when every stem has at least a second
   queued (a partial mix is not the song, as today). `seek()` flushes the
   decoders, clears the queues and primes again; the UI shows
   "buffering…" for the beat it takes. `position` comes from the
   counter, posted every frame's worth, with the context clock filling in
   between. Pause stops the counter; nothing decodes while paused beyond
   the window.
7. **When it runs out.** A stem whose queue is empty mid-play (a slow
   network) pauses the counter for all stems and shows buffering, rather
   than letting one stem drop out and the mix go wrong; see the question.
8. **What needs whole buffers.** Scan stems, Detect chords and the amp's
   play-along render read `engine.buffers()`. In streamed mode the engine
   decodes the stems one at a time on demand (`decodeAudioData` on the
   rendition, used, released), so the peak is one stem; the analyses
   already take per-stem buffers and combine features. The mix download
   is server side and untouched. The looper and the Studio have their own
   engines.
9. **Mode choice.** `load()` streams when the decoded estimate
   (`decodedStemBytes`) passes the device's budget (`stemMemoryBudget`)
   and the decoder is there; else buffered, with the warnings shipped in
   v0.126.0. A switch in the player's menu lets a listener force either
   (remembered in the browser), and an admin site setting forces streaming
   for everyone while it is tested.
10. **Browsers without the decoder.** Safari 18 and earlier (about a
    fifth of Safari sessions today), Firefox on Android: buffered mode as
    now. No wasm AAC decoder: FDK is Fraunhofer-licensed, faad2 is GPL,
    ffmpeg's LGPL decoder is a 300 KB build with its own patent question.
    If a fallback ever matters, the clean one is an Opus rendition per
    stem and `opus-decoder` (86 KB, BSD), which mediabunny takes as a
    custom decoder; that is a second rendition to store and transcode,
    and it buys nothing on the browsers WebCodecs already covers.

### Memory, roughly

Per four-minute stereo stem, buffered: 61 MB. Streamed: the window only,
the compressed file read by range as needed.

| Window at 48 kHz, stereo | Per stem | 30 stems |
| ------------------------ | -------- | -------- |
| 12 s ahead + 1 s behind  | 5 MB     | 150 MB   |
| 20 s ahead + 2 s behind  | 8.4 MB   | 253 MB   |

A 32 kHz context would shave a third but means resampling 48 kHz
decoder output in the worker; the renditions are 48 kHz, most devices'
contexts are 48 kHz, and the streamed mode has no reason to keep the
32 kHz the buffered mode chose for memory.

## Phases

1. **Spike (a few days).** A hidden dev page that takes one real
   rendition URL, demuxes with mediabunny in a worker, decodes with
   WebCodecs, plays through the mixer worklet with seek, and prints CPU
   per stem and time-to-first-sound. Run on Chrome, Firefox, Safari 26
   on a Mac, and iOS 26, including behind the lock screen. This settles
   whether the whole plan stands.
2. **The streamed engine.** The mode behind `StemEngine`: worker, worklet,
   priming, seek, buffering state in the UI, on-demand buffers for the
   analyses, the mode switch and the admin setting, Sentry breadcrumbs
   (mode, underruns, time to first sound), unit tests for the mixer's
   pure parts (chunk queue, gain ramps, the counter), a Playwright test
   that forces streaming on the test song, docs/stem-engine.md.
3. **Hardening and rollout.** Presign expiry on long sessions (re-fetch
   the manifest on a 403), underrun tuning, the lock-screen and
   home-screen PWA cases on iOS, the private store, then automatic mode
   in production.

Later, if wanted: an Opus rendition for the browsers without AAC in
WebCodecs; Int16 windows to halve them again; the same streaming for the
demos and mixes views (they are single files and need none of this).

## Open questions

1. **Which browsers must stream?** WebCodecs AAC covers Chrome, Edge,
   Firefox on desktop and Safari 26 and later. Older Safari and iOS, and
   Firefox on Android, would keep today's full decode with its warnings.
   Is that acceptable, or do we add the Opus rendition from the start so
   every browser streams?
   _Recommendation: accept it. Safari 26 shipped a year ago and the
   share of older iOS falls every month; the Opus path can come later if
   the numbers say so._
2. **When to stream.** Automatically when the song passes the device's
   budget, or always, for every listener? Always means less memory
   everywhere and one path to maintain, but a brand-new path for every
   listener and CPU spent on small songs that were fine.
   _Recommendation: automatic by budget, a switch in the player's menu to
   force either way, an admin site setting to force streaming while we
   test._
3. **Context rate in streamed mode.** 48 kHz (the renditions' rate, no
   resampling, slightly better sound) or 32 kHz (a third less window
   memory, consistent with buffered mode)?
   _Recommendation: 48 kHz with a 12-second window._
4. **A stem runs dry mid-play.** Pause everything and show "buffering"
   until it catches up, or let that stem fall silent while the rest play
   on?
   _Recommendation: pause everything. A mix with a stem missing is wrong
   in a way that is hard to notice, which is worse than a visible pause._
5. **Scan stems and Detect chords on a streamed song.** Decode the stems
   one at a time on demand (slower, a stem's worth of memory at a time)
   or disable them with a note to use a computer?
   _Recommendation: on demand._
6. **Rollout.** Admin-forced on dev and staging first, then automatic in
   production after the bands with the biggest songs have tried it?
   _Recommendation: yes, and keep the buffered mode as the fallback for
   as long as it costs nothing._
