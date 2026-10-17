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
ChannelMerger instead, so it sits at unity in both channels at center as
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
mix's key includes a pan only when it is off center, so every song whose
stems are centered keeps the key it had and nothing re-renders.

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
name and the waveform wear the color (`Waveform` takes a `color` prop
and sets it as the canvas's CSS color, which `draw` reads); the meter,
the knobs and the buttons stay as they are, so a tinted row is a hint.
A muted or un-soloed row drops its tint with its brightness. The
manifest carries `tint`, the engine keeps it on `StemState.tint`, and a
refreshed manifest re-tints in place (`retint`), as a rename relabels.

## The Stage (2026-10-16)

A second view of the same mix (docs/visual-mixer.md has the design and
the phases): `MixerStage.svelte` draws every track as a puck on a field,
left to right its pan, up its heard level (the fader in dB plus the
track's own loudness relative to the loudest, from the stored `peaks`
through `utils/stemLoudness.ts`), and a drag writes both through the
`MixerModel` in `src/lib/audio/mixerModel.ts`, which wraps either this
engine (`stemMixerModel`) or Dawn's (`studioMixerModel`). The geometry is
`utils/stagePosition.ts`. `StemPlayer` keeps a Tracks / Stage toggle
(remembered in `localStorage` as `stemshovel.playerView`, read after
hydration) and swaps the rows for the stage; the timelines, the menu
snippet and the local mix work as before, since nothing but the view
changes. For the halos the meters carry an RMS beside the peak
(`MeterState.rms`, smoothed over 300 ms on the way down): buffered, from
the same analyser frame as the peak; streamed, the worklet sums the
squares it already mixes and `takePeaks` posts `rms` and `masterRms`
with the peaks.

### Undo for the mix (2026-10-16)

Both engines keep an undo step per gesture for mix moves, from the
rows, the Stage, the knobs or the keys alike (`utils/mixHistory.ts`: a
change that comes more than 400 ms after the last starts a new step,
with the state before it as the snapshot, so a drag or a held key is one
step). The stem engine holds its own stack of fader, pan, mute, solo and
master snapshots (`undoMix`, `redoMix`, `canUndoMix`, `canRedoMix`;
cleared by `clearMixHistory`, which the player calls once a load has the
listener's local mix on it, since that is the starting point and not a
move). `StemPlayer` binds ⌘Z and ⌘⇧Z on the window (outside text
entry, when the player has the keys) and the Stage's strip offers the
two buttons. Dawn's mix moves join its existing arrangement history
(`#commitMixGesture` before `#commit`), so its Undo button and ⌘Z step
through edits and moves alike; effects sliders join too.

## The click (2026-10-17)

A metronome in time with the stems (Kevin: easy and intuitive, right
from the player, only when the song's tempo is defined). `StemClick`
(`src/lib/audio/stemClick.svelte.ts`, one per `StemPlayer`) is not the
page's metronome engine: it schedules its own oscillator clicks on the
stem engine's context, at the context time the engine says each song
second sounds (`engine.clockAt(seconds)`: buffered, `startedAt + (seconds
− offset)`; streamed, the worklet's last reported counter run forward, or
null while buffering). Each beat comes from the song's grid through
`nextBeatAt` in `measures.ts` (the first beat line at or after a second,
through tempo and meter changes, the bar's first beat accented), so a
seek, a pause or a settings save that moves the tempo re-plans the
beats from the playhead: the lookahead loop (`lookahead.ts`) notices the
clock's origin move and drops what it had queued. The click goes to the
destination through its own gain, outside the master and the mix
downloads. The Transport shows the button only when the player has a
grid, with a level knob beside it while it is on; the level is
remembered per browser, on/off is not (a click nobody asked for is a
shock). The dev hook `window.__click` carries it for the browser test
(`tests/e2e/click.spec.ts`).

## Loop (2026-10-17)

A stretch of the song can be selected and looped (Kevin: a section's
button highlights it across every row; Loop toggles; nothing selected
loops the whole song; a hand-drawn stretch is the secondary way). The
engine holds `loop` (the selection, `{start, end}` or null) and
`looping` (the toggle); the region that plays round is the selection,
else the whole song (`#region`). Buffered playback runs in **passes**
(`#passes`, as Dawn's engine does): a pass schedules every stem's source
from `from` at context time `when`, and a loop's pass also stops them at
the region's end; half a second before that end the tick queues the next
pass from the region's start at exactly that moment, so the seam is
sample-exact. `#currentPosition` and `clockAt` read the pass that has
begun. Streamed, the seam is a seek (the worklet re-primes at the start,
a short gap), and the worklet's `ended` becomes a seek to the start when
looping. A selection made while looping and playing, or the toggle
itself, re-plans from the playhead (`seek` to where it is: a 50 ms
restart); turned on with the playhead outside the selection, playback
goes to its start, and from past the selection's end the song plays out.
`SectionTimeline` selects a block on click (again clears) and seeks to
its start; `Waveform` draws the band (`range`) and turns a drag of more
than 4 px into `onrange` (the click after it does not seek); `MidiRoll`
and the comment row's waveform draw the band too (the row's
`TimelineSource` gained optional `loop` / `setLoop`). The Transport's
Loop button and the L key toggle; Escape clears the selection. A load
clears both.

### The count-in (2026-10-17)

With the click on, Play counts in before the stems start (Kevin: a
configurable length, a bar by default). The engine takes a `prelude`
(set by `StemClick`): called in `play()` with the context and the moment
the stems would start, it schedules the count-in's clicks, says how many
seconds to hold the stems, and can cancel itself; `play()` starts the
pass that much later (streamed: the worklet's "play" waits on a timer),
and `pause` or a seek cancels it. The beats come from `countInBeats` in
`measures.ts`: the grid's own beats leading up to the song's entry (the
first beat line at or after the playhead; bar 1 itself from before it),
so the count-in's "one" is the song's and the stems enter on it. Only
the beats before the playhead sound from the prelude; from the playhead
on, the click's regular plan has every beat, the entry's "one" included,
which is why the engine says where streamed playback will start
(`#streamStartAt`, read by `clockAt` until the worklet's counter
confirms it) and why the plan starts from the playhead rather than the
clock while the stems hold. The Transport's readout counts the count-in
down, "−1 | 4 … −1 | 1" (the bar before the entry's, the beats left in
it; `countInBeats` says how many beats are left at each). `click.countIn`
is 0, 1, 2 or 4 bars, remembered per browser (`stemshovel.clickCountIn`),
chosen in the Transport beside the click's level; `click.countingIn`
pulses the button while it runs. A re-plan of the click now adopts a
small shift of the clock's origin (a streamed report's jitter) without
dropping the clicks already queued; only a seek or a loop's turn plans
again.
