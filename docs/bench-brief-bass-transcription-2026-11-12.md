# Bench brief: is a transcribed bass line right often enough to show a bassist? (2026-11-12)

From the stem-shovel session, at Kevin's request. He wants each stem to
carry its own part written out, starting with the bass: "a bass stem has
its bass line written out in barmark notation." Before anything is built,
the question is whether the result is good enough to put in front of a
player. That is yours to measure.

## What exists in the app

- **The transcriber.** Basic Pitch (Spotify, the ONNX/tfjs model in
  `src/lib/server/notes.ts`) already reads each tonal stem into notes
  (`{ start, end, pitch, amplitude }`, seconds and MIDI pitch) for the
  chord check. Today the notes of all stems are merged into one list on
  the song and which stem each came from is thrown away. Keeping them per
  stem is a storage change, not a research question.
- **The grid.** Beat This small0's beats and downbeats per recording
  (`song.beats_json`, Studies 41 to 44), with our half-bar joining and
  the 0.4 steady share.
- **The notation.** barmark writes a part's notes as a line under the
  chords: a bar is cells of beats, a note set is `{G1}`, durations come
  from a cell's subdivision (`{G2}._{D3}` is a dotted eighth and a
  sixteenth), a rest is an empty slot, and a named part line (`Bs`) sits
  in a system (grammar 2.2, 7.4, 7.6; the README's "Systems" section).
  `@barmark/score` engraves it.

So the pipeline to judge is: bass stem → notes → quantized to the
tracker's beats → a barmark `Bs` line.

## The question

On real bass stems, is the written line right often enough that a
bassist would use it rather than throw it away? Break it into the three
places it can fail, because the fix for each is different:

**Ask A, the transcription.** Against a ground truth for the bass stem
(MIDI where the corpus has it, a careful hand transcription of a few
songs where it does not), note-level precision, recall and F for onset
and pitch, with the usual tolerances (50 ms, a semitone), and separately
the **octave error rate**: a bass line an octave off is the same pitch
class and a wrong part. Report by register, since the lowest notes (E1
to A1) are where a general-purpose transcriber is weakest. Is Basic
Pitch's failure on bass mostly octaves, ghost notes from string noise
and fret buzz, missed repeated notes, or smeared ends?

**Ask B, a transcriber built for the job.** Basic Pitch is polyphonic
and general. A bass stem is one note at a time. Does a monophonic pitch
tracker (pYIN, CREPE, or whichever you judge best; say what and why) with
onset detection on the same stems beat it, and by how much? If a simple
constraint on Basic Pitch's output (one note at a time, the bass's range,
the lowest stable candidate) gets most of the way, say so: that is
cheaper for the app than a second model.

**Ask C, the quantization.** Given the notes, put each on the tracker's
beat grid at a sixteenth (and at a triplet where the song swings) and
grade the rhythm against the truth: the share of notes on the right
subdivision, and the share of bars whose written rhythm is exactly
right. State the rule you used to choose between straight and triplet
subdivision and to drop notes too short to be meant. This is where we
expect the result to be made or lost.

**Ask D, the verdict a musician would give.** For each song, the share
of bars that are entirely right (every pitch, octave and rhythm), bars
with one error, and bars that are wrong. Then the bench's labeled
judgment, as a player: at what share does a written bass line help more
than it misleads, and does the best pipeline clear it? If it clears it
on some material and not on other (a clean DI against a miked amp, a
picked line against a slid or slapped one), say what in the stem predicts
it, so the app can decline to write a line it would get wrong.

## Corpus

The MMKK songs with separate bass stems (Kevin owns them outright; audio
never committed), the ten Woodward songs if they carry a bass stem, and
any open multitrack set you already hold that has bass stems with MIDI or
note annotations as truth. Say which have machine truth and which you
transcribed by hand, and how many bars each contributes.

## What we would build on a yes

Notes kept per stem; the bass line quantized on the tracker's beats by
your rule; a `Bs` part line stored with the stem and shown on it, with
the Score view to read it; bass only at first. On a no, or a "only
with a monophonic tracker", say what would have to change, and we will
weigh whether a second model in the jobs function is worth one part.

## Fence

$3. Hand transcription is the expensive part: keep it to what Ask D
needs to mean something, and say how many bars that was.
