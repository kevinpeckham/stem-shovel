# How the StemEngine works

A plain-language tour of `src/lib/audio/engine.svelte.ts`, the class behind
the multi-stem player. About 350 lines with no dependencies beyond the
browser's Web Audio API. The reference for its surroundings (sections,
timeline, position formats, memory limits) is docs/audio-engine.md.

## The graph

One `AudioContext` at 32 kHz. Each stem gets a `GainNode` that feeds a
master `GainNode` into the destination. That is the whole signal chain: no
effects, no analysers on the playback path. The context is created lazily on
first use, since it must never run during server rendering.

## Why 32 kHz

Decoded audio lives in memory as float samples: about 128 KB per second per
channel at that rate, so a four-minute stereo stem is around 60 MB. Decoding
into a 32 kHz context roughly quarters the memory of 44.1 kHz stereo while
sounding fine for review, and memory, not bandwidth, is the binding limit
with 32 stems allowed per song.

## Loading

`load()` first seeds every row from the manifest, using the duration,
channel count and waveform peaks recorded at upload, so rows and waveforms
appear at once, dimmed and marked "decoding". Then it fetches and decodes
three files at a time: more in flight only raises peak memory without
finishing sooner. Each file is the AAC playback rendition where one exists,
about a tenth of the source WAV. After decoding, a dual-mono file whose left
and right samples match collapses to one channel (`lib/audio/mono.ts`).
Play enables only once every stem is ready, because a partial mix is not
the song.

## Sync

Web Audio source nodes are one-shot, so `play()` creates a fresh
`AudioBufferSourceNode` per stem, connects it to the stem's gain, and calls
`start(when, offset)` on all of them with the same `when`, a timestamp 50 ms
ahead on the context clock (`START_LEAD`). Every scheduling call lands
before that deadline, so the stems begin on the same sample by construction.
Nothing drifts afterwards because they share one clock.

## Transport

Pause records the current position, stops every source and cancels the
frame loop. Seek is the same stop plus a restart from the new offset.
Position is a Svelte `$state` field updated every animation frame from the
context clock, so components read `engine.position` directly and the
readout, playhead and section highlight follow without wiring.

## Mixing

Each stem has a fader up to 1.25 (`FADER_MAX`), a mute and a solo; the
effective gain folds those together, with solo winning over everything
else. Changes ramp over 15 ms with `setTargetAtTime` (`RAMP`), so faders
never click. The same effective gains can be snapshotted (`mix()`) for the
server-side MP3 mixdown, which is how "Download custom mix" reproduces what
you are hearing. The listener's own settings are kept in their browser
(`lib/audio/localMix.ts`); the song's default mix is a saved set of fader
levels (`stem.gain`).

## Small details

- `remove()` drops one stem without redecoding the rest; the track length
  shrinks if it was the longest.
- `dispose()` closes the context.
- On iOS, `play()` first asks for the media audio session
  (`playThroughSilentSwitch`) so the mix is heard through the ring/silent
  switch.

## Streamed mode (2026-10-12)

Everything above is the buffered mode. A song past the device's memory
budget (utils/stemMemoryBudget), or any song when the listener or the
site says so, plays streamed instead (docs/stem-streaming.md): a worker
decodes a twelve-second window around the playhead from each stem's AAC
rendition with the browser's AudioDecoder, and one AudioWorkletProcessor
(`static/worklets/stem-mixer.js`) sums every stem against a single sample
counter. The engine's public surface is the same: `mode` says which is
running, `buffering` says the counter is stopped for a window to fill,
`position` comes from the worklet's reports run forward on the context
clock, gains go to the worklet as messages with the same 15 ms ramp, and
`seek` bumps a generation so the old chunks are dropped. The context is
48 kHz in this mode (the renditions' rate), 32 kHz in the other. The
analyses that need whole buffers call `decodedBuffers()`, which decodes
the stems on demand when streamed. Where the browser has no AudioDecoder
(Safari before 26, Firefox on Android) the mode is never chosen, and a
streamed load that fails before it is ready falls back to buffered.

## What sits next to it

The waveform display is not inside the engine: peaks are computed at upload
and drawn on a canvas (`Waveform.svelte`), so the engine never has to walk
the buffers for drawing. Tempo, key and meter detection
(`lib/audio/analysis.ts`) run on the decoded buffers at upload, and the
Idea Recorder uses its own `AudioContext` for the level meter only.

## Pan (2026-10-14)

Every stem row has a pan knob beside the fader, as a Studio track does
(Kevin). `StemState.pan` runs -1 to 1; `setPan` ramps it over the same
15 ms as a fader. Buffered, a stereo buffer goes through a
StereoPannerNode (the Web Audio law: its own channels kept, the far one
leaning over); a mono buffer goes through a pair of gains into a
ChannelMerger instead, so it sits at unity in both channels at centre as
it did before pans (a StereoPannerNode would put a mono source at 0.707
each side, a 3 dB drop on every mono stem) and the far channel falls
away on a sine as it turns (`monoPan`). Streamed, the mixer worklet
applies the same two laws per chunk (`panWeights` in
`static/worklets/stem-mixer.js`), ramped like the gain. The pan rides
with the mix everywhere a gain does: the listener's own mix in the
browser (`LocalMix.pans`, absent in older saves), the custom mix download
(`?stems=id:gain:pan`; the server's `panFilter` writes ffmpeg's `pan`
filter with the StereoPanner's stereo law, since the renditions are
upmixed to stereo first), and the song's saved default mix (`stem.pan`,
migration 0086, `DefaultMixSchema`, the manifest's `pan`). The original
mix's key includes a pan only when it is off centre, so every song whose
stems are centred keeps the key it had and nothing re-renders.

## Meters (2026-10-15)

Every stem row and the master carry a level meter with a peak-hold mark
and a clip light that sticks until it is clicked (Kevin). The engine
keeps `levels` (per stem) and `masterLevel` as `MeterState`
(`src/lib/utils/meterLevel.ts`: the level shown, falling at 1.6 a second
once the signal drops; the hold mark, kept a second and a half then
falling; `clipped`, set by any peak at or over full scale and cleared
only by `resetClips`). A frame loop (`#meterStep`) runs while playing
and until the bars have fallen to rest. Buffered, each stem has an
AnalyserNode on its pan's output (what the stem puts into the sum, after
fader and pan) and the master's analyser sits after the master gain.
Streamed, the mixer worklet tracks each stem's peak as it adds the
stem's samples and the sum's peak per quantum, and posts them every
1024 samples (`levels`); the engine keeps the highest since the last
frame so a transient between frames still lights the clip, and scales
the sum's peak by the master gain, which is applied after the worklet.
`LevelMeter.svelte` draws the bar on a dB scale (−48 dB to unity;
amber from −6 dB, red at full scale), the mark as a thin tick, and the
light as a small square, red while a clip is held; a click resets that
stem's (or, on the master, everything's).

## Tints (2026-10-16)

An editor can tint a stem's row from its ⋯ menu, so a band tells its
guitars from its keys at a glance (Kevin: controlled, complementary,
restrained; no rainbow). The palette is `STEM_TINTS` in
`src/lib/constants/stemTints.ts`: eight hues at one middling lightness
and low saturation, stored by id on the stem (`stem.tint`, migration 0087) and shared with the song, so everyone sees the same rows. Only the
name and the waveform wear the colour (`Waveform` takes a `color` prop
and sets it as the canvas's CSS colour, which `draw` reads); the meter,
the knobs and the buttons stay as they are, so a tinted row is a hint.
A muted or un-soloed row drops its tint with its brightness. The
manifest carries `tint`, the engine keeps it on `StemState.tint`, and a
refreshed manifest re-tints in place (`retint`), as a rename relabels.
