# Looper

Scoped 2026-10-01 at Kevin's request: "a standalone tool much like the
idea recorder, where you can input microphone, as well as piano and
drums. I think it would be analog in the first phase and we can look at
midi as an upgrade later, or even combination analog / midi. A lot of the
foundation of what we would need is already built especially after the
multitrack ability." Nothing here is built yet.

## What it is

A loop station at `/looper`, the user's own page like the Idea Recorder:
a loop of a fixed length (bars at a tempo) that plays round and round
while layers are recorded onto it, one pass at a time, from the microphone,
the piano or the drum machine. Each layer is audio (phase 1); a layer can
be muted, soloed, trimmed in level or thrown away; the whole loop can be
saved as an idea's take (the mix) with the layers as its sources, so it
goes to a song as stems through what multitrack takes already built.

## What exists already (docs/demo-recording.md)

- **Sources as streams.** `piano.captureStream()` and
  `drumMachine.captureStream()` give each instrument's output as a
  MediaStream; the recorder's `instruments()` pattern gathers them at a
  gesture. The microphone comes from `getUserMedia` with the voice
  processors off, the input chosen in the recorder settings.
- **Per-source recording.** Multitrack takes start a MediaRecorder per
  source in one tick and keep the files aligned within milliseconds; the
  upload queue carries sources with a take; `recording_stem` rows hold
  them; `copyRecordingStemsToSong` turns them into a song's stems.
- **Tempo and transport.** The metronome engine (`metronome.svelte.ts`)
  and the drum machine's scheduler run a Web Audio clock with look-ahead
  scheduling; the drum machine's `placePattern`, swing and humanize are
  already tempo-locked; `claimPlayback` keeps one transport at a time.
- **Panels.** `FloatingPanel` hosts the piano, the drums, the metronome
  and the tuner on the recorder page; the looper page can reuse them and
  the `spaceOwner` arrangement for the space bar.
- **Meters, waveform, mic mute.** `RecorderWave`, the per-instrument
  meters and the mute button.

## Design, phase 1 (audio)

**The loop.** Length in bars (1, 2, 4, 8) at a tempo; the metronome
counts in (one bar) and clicks on the first pass, optionally after. The
loop is an AudioBuffer per layer of exactly `bars × beats × 60 / bpm`
seconds at the context's rate, played by `AudioBufferSourceNode`s with
`loop = true`, all started at the same context time so they stay locked;
the drum machine, when used as a layer source, is simply recorded like
anything else (its own clock is independent, so start it from the looper's
count-in and let the recorded audio carry it; a later phase can sync it).

**Recording a layer.** Not MediaRecorder (its chunks arrive late and the
format is compressed or container-wrapped): a `ScriptProcessor`-free path
through an `AudioWorkletNode` that copies the source's samples into a ring
buffer from the moment the loop's bar 1 passes until a full loop has gone
by, then the layer is a buffer trimmed to the loop length exactly, so the
seam is sample-accurate. Latency: the microphone's input latency
(`baseLatency` + `outputLatency`, typically 10–40 ms) is compensated by
shifting the recorded buffer left by that much (a setting to nudge it,
measured once with a click through the speakers and the microphone, the
way loop pedals calibrate). The instruments' streams come from the same
machine's audio graph, so their latency is the graph's, near zero.
Overdub by default (a layer adds to the loop), or replace the last layer;
undo the last layer; "punch in" for a bar range later.

**Sources.** The microphone (with the mute), the piano (keys or MIDI in),
the drums (the panel, or the compact control); the per-instrument meters
show them. Each layer remembers its source and gets its label.

**Layers panel.** A row per layer: label, waveform (the `RecorderWave`
take strip at the loop length), level, mute, solo, delete; the loop's
transport (play/stop, record, tempo, bars, count-in, click on/off); the
output through a master with the recorder's tone/effects left out in
phase 1.

**Saving.** "Save as take" renders the mix of the layers (offline, one
loop length or N repeats) as the idea's take and the layers as its
sources, through the existing queue and `recording_stem`, so **Add N
stems to song…** works unchanged; the loop's settings (bars, tempo,
layers' levels) go on the idea as instruments do. A `looper` JSON on the
idea could later re-open the loop for more layers (phase 1.5: keep the
layer audio in the take's sources and rebuild the loop from them).

**Page.** `/looper`, user-owned like the recorder, with the panels; a
home page demo later. Container queries throughout (Kevin's rule).

## Phase 2 (MIDI, optional)

A piano or drum layer recorded as MIDI events (note on/off with velocity
at loop time) instead of audio: quantisable, editable, re-voiced with
another sound, and lighter. The piano's `noteOn/noteOff` and the drum
machine's `#record` (grid recording from MIDI in) already produce the
events; the looper would keep them per layer and replay through the
engines at loop time, mixing with audio layers. A layer could be both
(audio for what was heard, MIDI for what was played), which Kevin
mentioned as a "combination analog / midi".

## Risks and open questions

- **Seam accuracy.** Audio layers must be exactly the loop length; a
  worklet with the context clock gives that, MediaRecorder does not.
- **Microphone latency** needs the one-time calibration; without it, a
  sung layer lands tens of milliseconds late and sounds behind.
- **iOS**: a worklet and several sources are fine, but the first touch
  must warm everything (the piano's wake dance applies); memory for long
  loops is modest (8 bars at 120 bpm stereo ≈ 3 MB per layer).
- **Drum machine sync**: phase 1 records its audio; a later phase could
  drive it from the looper's clock so pattern changes stay in time.
- **Storage**: a saved loop is a take with sources, counted as any take.

## Estimate

Phase 1 (audio looper with the three sources, layers panel, save as take
with sources): about three days of work. MIDI layers: two more.
