# How the effects are engineered

The piano and the drum machine carry a rack of effects: reverb, delay
(digital or analog), fuzz, wah, chorus, phaser or flanger, tremolo, a
rotary speaker and a tone stage (tilt, an exciter and a low-end
enhancer). This is how they are built and why they sound the way they do.
The short version: there is no audio library, no worklet, no WebAssembly
and no sample file. Every effect is a small graph of the browser's own Web
Audio nodes, and the numbers that shape it were chosen by rendering test
tones through the same code offline and measuring the result.

## Where the code is

- `src/lib/audio/fxStages.ts` — the stages both instruments share: the
  fuzz, the delay with its analog character, the wah, and the tone stage.
- `src/lib/audio/pianoFx.ts` — the piano's chain (`createPianoFx`): voices
  → fuzz → wah → chorus → phaser or flanger → tremolo → rotary → dry bus, with
  reverb and delay sends off the dry bus into the master.
- `src/lib/audio/drumBus.ts` — the drum mixer (`createDrumBus`): the dry
  drums through the fuzz and the wah into the master; a delay send and a reverb send,
  each with its own return level, that every row feeds by its own sends.
  `reverbImpulse` lives here too and the piano borrows it.
- The settings: `src/lib/utils/pianoPreferences.ts` for the piano (kept in
  the browser's localStorage) and `fx` in `src/lib/val/DrumPatternSchema.ts`
  for the drum machine (part of the beat: saved, in the share link, in the
  WAV).

## The building blocks

The Web Audio API is a graph of nodes running on the browser's audio
thread. The effects use nine of them:

- **GainNode** — a multiplier. Every level, mix and send is one, and a
  gain whose `gain` is driven by an oscillator is a tremolo.
- **DelayNode** — a buffer that plays its input late by `delayTime`, which
  can change while it plays. Delay, chorus, flanger and the rotary's
  Doppler are all this node.
- **BiquadFilterNode** — a second-order filter: low-pass for the delay's
  damping, the fuzz's tone and the wah (resonant, its cutoff moving),
  high-pass and low-pass as the rotary's crossover, all-pass for the
  phaser, shelves for the tilt.
- **ConvolverNode** — convolves its input with a buffer. Given a room's
  impulse response it is a reverb.
- **ConstantSourceNode** — a steady value as a signal, which a MIDI pedal's
  position becomes so it can be summed into the wah's cutoff like the
  oscillators.
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

#### Why the fuzz oversamples

Digital audio at 44.1 kHz can hold nothing above 22.05 kHz, the Nyquist
limit. A clipper adds harmonics: a 1 kHz tone pushed into the tanh curve
comes out with energy at 3, 5, 7 kHz and on upwards, further the harder
the drive. A harmonic the clipper makes above the limit does not vanish;
it folds back down, reflected off the limit, and lands at a frequency
unrelated to the note (25 kHz appears at 19.1 kHz, 41 kHz at 3.1 kHz, in
the middle of the music). That aliasing is the fizzy, out-of-tune grit of
cheap digital distortion.

`oversample = "4x"` has the browser run the WaveShaper at four times the
context rate: inside the node, each block is upsampled to 176.4 kHz, the
curve applied there, then low-pass filtered and brought back down. At the
higher rate the limit is 88.2 kHz, so the harmonics have four times the
headroom before they fold, and the ones that still reach that high are
very weak, since tanh's series falls off steadily; the low-pass before the
downsample then removes everything above 22 kHz cleanly. What comes back
into the graph is the distorted tone with its true harmonics and nothing
folded on top. One line in `fxStages.ts`; the resampling is the browser's.

The analog delay's loop shaper does not oversample. Its curve is gentle,
it barely bends at ordinary levels, and a 2 kHz low-pass follows it in
the loop, so it makes few high harmonics and the damping removes them
anyway; four times the work there would buy nothing audible. The fuzz is
driven up to 31 times and meant to sound square, which is exactly where
aliasing shows. The cost is four times the samples plus two resampling
filters on one stereo signal, small enough that the drum machine runs
its fuzz on the whole mix without strain.

### Wah

A wah is a resonant filter whose cutoff moves. The stage is one
BiquadFilterNode in low-pass mode (a band-pass was tried first and threw
away 19 dB of the sound; the low-pass keeps the body and moves a peak,
which is the vowel of a pedal), with its cutoff at a 350 Hz floor plus up
to 1.8 kHz of travel set by the range slider. Three sources are summed
into the cutoff and the mode opens one of them:

- **Touch** is an envelope follower: the signal through a WaveShaper
  whose curve is |x| (a full-wave rectifier), then a 6 Hz low-pass to
  smooth it into a level, then a gain the sensitivity sets, into the
  filter's frequency. The filter opens with how hard you play and closes
  as the note dies, within about 50 ms either way.
- **Sweep** is the chain's LFO wrapper, the filter sitting mid-travel and
  swinging up and down at the rate.
- **A pedal**: a ConstantSourceNode whose offset is a MIDI mod wheel,
  expression pedal or foot controller's position (CC 1, 11 or 4). While
  one sends, the other two sources ramp to zero and the pedal has the
  filter; disconnecting MIDI hands it back.

On the drum bus the same stage runs in Sweep only, its LFO timed in bars
of the beat rather than in Hz (one cycle per beat up to one per four
bars), so the sweep lands on the downbeat; its resonance is capped at
10 dB, since a sharp peak passing a kick's fundamental is a bump.

Resonance is the filter's Q, and for a Web Audio low-pass Q is in
decibels: the height of the peak at the cutoff, 0 to 15 dB here. The wet
is trimmed to 0.7 to leave that peak room; measured on a sawtooth the
fully wet sound sits within 1 dB of dry, and full resonance lifts the
harmonic at the cutoff 15 dB over the dry one.

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

### Tone: tilt, air and bottom

One stage on the master of both instruments, after everything else
including the reverb and delay returns (`createToneStage`), three
sliders:

- **Tilt** is a low shelf at 250 Hz and a high shelf at 2.5 kHz with
  their gains moving opposite ways, up to 6 dB each, in series on the
  signal. One slider from dark to bright, flat in the middle, with no
  wrong settings.
- **Air** is an exciter after Aphex's Aural Exciter. The signal above
  2 kHz goes into a hot gain and a tanh WaveShaper (four times
  oversampled, as the fuzz is), which makes new harmonics above what was
  there; a 4 kHz high-pass keeps only that new content, and it is mixed
  back in at up to a quarter. The difference from a shelf is the point:
  a shelf can only raise what a sound already has; the exciter
  manufactures harmonics above the sound's own top. It needs something
  in the band to work from, though: measured, a sound low-passed at
  2 kHz gains nothing, and one with a top end gains 9 dB between 6 and
  12 kHz at full Air with the overall level up by less than half a
  decibel.
- **Bottom** is after the intent of the same unit's Big Bottom: bass that
  feels bigger. Four designs were measured before this one. Aphex's own
  trick, a compressor on the low band mixed back, cancelled itself
  because a Web Audio compressor carries a few milliseconds of lookahead
  and the delayed band came back out of phase. A harmonic enhancer, the
  band's second and third harmonics mixed back, read as brightness and
  grit rather than weight (Kevin's ear). A parallel sub band mixed back
  lost most of itself to the filters' phase lag at half and gained at
  full only through saturation. A Linkwitz-Riley crossover summed flat
  but its phase rotation put a sawtooth's peaks up 5 dB before any
  boost. The one that works is a subtractive split: the output is the
  signal, minus its band under 100 Hz, plus that band boosted by up to
  8 dB through a gentle tanh that folds only the loudest peaks, with no
  oversampling on the shaper (its resampling delay was another phase
  cancellation, 11 dB at 55 Hz, measured). At zero the band is added back
  exactly as it was and the output is the signal bit for bit; above zero
  only the band's increase is added, in phase with it. Measured on a
  pulsing 55 Hz sawtooth: the fundamental up 2.8 dB at half and
  5.3 dB at full, everything from 110 Hz up unchanged within a
  tenth of a decibel, and the peak sample up 3.2 dB.

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
