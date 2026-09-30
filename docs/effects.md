# How the effects are engineered

The piano and the drum machine carry a rack of effects: reverb, delay
(digital or analog), fuzz, chorus, phaser or flanger, tremolo and a rotary
speaker. This is how they are built and why they sound the way they do.
The short version: there is no audio library, no worklet, no WebAssembly
and no sample file. Every effect is a small graph of the browser's own Web
Audio nodes, and the numbers that shape it were chosen by rendering test
tones through the same code offline and measuring the result.

## Where the code is

- `src/lib/audio/fxStages.ts` — the two stages both instruments share: the
  fuzz, and the delay with its analog character.
- `src/lib/audio/pianoFx.ts` — the piano's chain (`createPianoFx`): voices
  → fuzz → chorus → phaser or flanger → tremolo → rotary → dry bus, with
  reverb and delay sends off the dry bus into the master.
- `src/lib/audio/drumBus.ts` — the drum mixer (`createDrumBus`): the dry
  drums through the fuzz into the master; a delay send and a reverb send,
  each with its own return level, that every row feeds by its own sends.
  `reverbImpulse` lives here too and the piano borrows it.
- The settings: `src/lib/utils/pianoPreferences.ts` for the piano (kept in
  the browser's localStorage) and `fx` in `src/lib/val/DrumPatternSchema.ts`
  for the drum machine (part of the beat: saved, in the share link, in the
  WAV).

## The building blocks

The Web Audio API is a graph of nodes running on the browser's audio
thread. The effects use eight of them:

- **GainNode** — a multiplier. Every level, mix and send is one, and a
  gain whose `gain` is driven by an oscillator is a tremolo.
- **DelayNode** — a buffer that plays its input late by `delayTime`, which
  can change while it plays. Delay, chorus, flanger and the rotary's
  Doppler are all this node.
- **BiquadFilterNode** — a second-order filter: low-pass for the delay's
  damping and the fuzz's tone, high-pass and low-pass as the rotary's
  crossover, all-pass for the phaser.
- **ConvolverNode** — convolves its input with a buffer. Given a room's
  impulse response it is a reverb.
- **WaveShaperNode** — a lookup table: each input sample becomes the
  curve's value at that point. A tanh curve is a soft clipper.
- **OscillatorNode** — the browser's own oscillator, sine, square, sawtooth
  or triangle at a frequency, generated anti-aliased on the audio thread.
  Every LFO is one, and so are the piano's synth voices
  (`src/lib/audio/synthVoice.ts`). We never compute a sine sample.
- **StereoPannerNode** — equal-power panning, for the chorus's two sides
  and the rotary's spin.
- **AudioParam** — not a node but the knob on each of them. A parameter can
  be set, ramped, or fed by another node's output, which is how an
  oscillator modulates a delay time or a gain: the oscillator's ±1 goes
  through a GainNode that scales it to the range wanted, then into the
  parameter, and the browser adds it every sample.

Two things are our own arithmetic. The reverb's impulse response is a
buffer filled in a loop. The WaveShaper curves are arrays of tanh values
computed once.

## The effects, one by one

### Reverb

A ConvolverNode over an impulse response synthesized at load
(`reverbImpulse`): two channels of white noise decaying exponentially,
half a second long at size 0 and three and a half at size 1, the tail
darkening as it goes (the noise blends towards a one-pole low-passed copy
of itself over the length). The decay's time constant is a fifth of the
length, so the tail is 60 dB down by the end. Unity at the start, so a
full send at the default return reads as a wet sound rather than a
whisper. Moving the size slider regenerates the buffer. The piano scales
the wet by half so its slider's top is a big room, not a wash.

### Delay, digital and analog

The drum machine's original shape, now `createDelayStage`: input → delay
→ loop shaper → damping low-pass → feedback gain → back into the delay,
and the delay into a return gain into the output. Feedback stops at 0.9
so the loop always dies. The drum machine's time is in steps of the beat,
so it follows the tempo; the piano's is in milliseconds, 50 to 1000.

Digital keeps the shaper's curve a straight line and the damping at
3.2 kHz. Analog swaps in three things:

- a soft clip in the loop, `tanh(1.6x) / 1.6`, whose slope is exactly 1 at
  small signals so the feedback stays what the slider says while the
  peaks fold down as tape saturates;
- a darker damping, 2 kHz, so each repeat loses more top than the last;
- a 0.4 Hz oscillator nudging the delay time by ±1.5 ms, the wow of a
  tape loop.

Measured on a 500 Hz + 3 kHz burst, the second analog repeat's 3 kHz sits
20 dB under the digital one's on the piano (9 dB through the drum bus,
whose damping is the same but whose repeats are shorter), and the tail
dies sooner, so a long analog tail wants more feedback.

### Fuzz

`createFuzzStage`: a gain of 1 + 30 × drive into a WaveShaper holding a
tanh curve (four times oversampled, which keeps the harmonics from
folding back down as aliasing), then a low-pass for tone from 700 Hz at 0
to 7 kHz at 1. The clipper's output is louder than its input by nature,
so a make-up gain follows: a signal peaking near `peak` comes out of the
clipper at tanh(peak × gain), and the make-up divides by that. `peak` is
0.3 for a piano voice and 0.8 for a drum hit. Measured on a 220 Hz tone,
the loudness stays within 1 dB of clean from off to full on the piano and
within 0.3 dB on the drums; at a tenth of the drive the third harmonic
sits 26 dB under the fundamental, at a third it is 10 dB under and the
wave is nearly square. The wet crossfades in over the first quarter of the
drive's travel, so drive 0 is clean and the slider's first inch is a
gentle grit. On the drum bus the fuzz sits on the dry drums only; the
delay and reverb sends leave before it and stay clean.

### Chorus

Two DelayNodes at 22 and 28 ms, each swept by one sine oscillator up to
±4 ms at full depth, one of them through a gain of −1 so they move in
opposite directions, panned left and right, and added to the dry signal
at the mix level. The wet is added rather than crossfaded, so full mix is
about 3.5 dB louder than dry; that is the chorus's nature.

### Phaser and flanger

One section, one at a time (a switch at its head), sharing the rate,
depth and mix sliders and one oscillator.

The **phaser** is four all-pass BiquadFilters in series, centred at 500,
800, 1300 and 2100 Hz, each moved by the oscillator up to ±400 Hz. An
all-pass passes every frequency at the same level but shifts their
phases, so summing the chain with the dry signal cancels some frequencies
and not others: notches, which the oscillator sweeps. Mix crossfades from
dry towards half and half, where the notches are deepest. Measured: a
1 kHz tone swings 11 dB as they pass.

The **flanger** is a DelayNode centred on 3 ms, swept ±2.5 ms at full
depth by the same oscillator, with 0.5 feedback that sharpens the comb.
Summed with the dry it makes a comb of evenly spaced notches, which the
sweep drags through the sound; the short delay is why it sounds like a jet
rather than a chorus. Measured: 14 dB of swing on the same tone.

### Tremolo

A GainNode sitting at 1 − depth / 2, with the oscillator (sine or square)
swinging it ±depth / 2, so depth 1 goes from full to silence. The
oscillator passes an 80 Hz low-pass on its way to the gain: a square's
instant step in level is a click on a sustained note (Kevin heard a
crunch on the Electric Piano), and the low-pass stretches each edge to
about 5 ms, still a chop, without the click. Measured: the largest
sample-to-sample jump with a square tremolo is no larger than the tone's
own slope.

### Rotary speaker

A Leslie cabinet spins a treble horn and a bass drum, so the sound
sweeps in pitch (Doppler), in level (the horn facing you or away) and in
position. The stage splits the signal at 800 Hz (two BiquadFilters with
Q 0.5, so there is no bump at the crossover) into a horn and a drum, and
spins each with its own oscillator, the two turning opposite ways:

- a DelayNode around 2 ms swept ±0.4 ms (horn) or ±0.15 ms (drum) for
  the Doppler;
- a gain swinging 30 % (horn) or 20 % (drum) for the level;
- a StereoPannerNode swept ±0.8 (horn) or ±0.6 (drum) for the position.

Slow is 0.8 / 0.7 Hz, Fast 6.7 / 5.7 Hz, and the oscillator frequencies
glide between them with `setTargetAtTime`, the horn in about a second
and the heavier drum in two, a Leslie's inertia; Off lets them coast to a
stop while the dry crossfades back. The wet is trimmed to 0.8 because the
two bands overlap at the crossover; measured within 1 dB of the dry at
300 Hz and 1.5 kHz, and the horn reaches 7 Hz within three seconds of
choosing Fast.

## Why nothing clicks

Every control is an AudioParam moved with `setTargetAtTime` over 20 ms
rather than set outright; a slider dragged across its range is a series
of short exponential glides. The drum bus is the exception when it
renders offline, where a value lands at once at time zero. Switching a
shaper's curve (Digital to Analog) is the one instantaneous change, and
it happens inside a loop already fading.

## Why it can be measured

Everything runs on a `BaseAudioContext`, the parent of both the live
`AudioContext` and the `OfflineAudioContext`. The same `createPianoFx`
and `createDrumBus` that play in the room render to a buffer offline,
which is how the drum machine's WAV export carries the effects and how
every figure above was taken: a Playwright script imports the module
through the dev server, renders a test tone or burst through it, and
reads the RMS and a Goertzel filter (one frequency's magnitude) off the
result. When an effect changes, the same script says whether it still
does what it did.

## What it costs

A whole chain is a few dozen nodes and a handful of oscillators, running
regardless of whether the effects are up: a chorus at mix 0 still sweeps
its delays into a gain of zero. That is cheap on the audio thread and
keeps every switch-on a gain ramp rather than a graph rebuild, which is
what would click. The reverb's impulse (up to three and a half seconds of
stereo noise) is the one allocation of any size, made at load and again
when the size slider moves.
