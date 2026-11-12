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

---

## The bench's answer (2026-11-12; stem-bench Study 48, docs/BRIEF-STUDY48.md, $0)

**No, not yet.** On six of Kevin's songs with MIDI truth for the bass
(Peaceful Dreams, Interbellum, Letter Lands, Eat All the Clocks, Mop
Heart; Downline from Ghost Ghost), 598 bars and 1,999 notes, no pipeline
writes a line that is entirely right in 70 % of bars and wrong in at most
10 %, on every song. Kevin's MIDI replaced the hand transcription, so the
$3 was not spent. The numbers, Basic Pitch as the app runs it unless
said:

**Ask A.** Note-level F with onset within 50 ms and the exact pitch:
0.57 to 0.79 by song; on pitch class alone 0.61 to 0.82. The octave
error rate is 12 % to 38 %, every error upward (the second harmonic),
worst in E1 to A1 on four of six songs. The rest of the loss is onsets:
one in six to one in four of the part's notes get no onset, and the
transcription adds a fifth to a half again as many onsets as the part
has, mostly re-triggers inside a sustained or decaying note.

**Ask B.** The cheap constraint (pitch 28 to 60, one note at a time
keeping the lowest, none under 60 ms) lifts exact F to 0.70 to 0.85 and
cuts the octave errors to 4 % to 15 %: take it, it is a filter. pYIN
(librosa, fmin 30 Hz) misses the octave on at most 2 % of notes but
finds fewer notes and adds more extras; it grades below Basic Pitch on
four of six songs. A second model is not the fix; CREPE was not tried.

**Ask C.** On the app's own stored beats (Downline on the bench's Beat
This reading of the band's mix), with a sixteenth or an eighth-note
triplet per beat chosen per bar from the line's own onsets (triplet only
when it fits the onsets under 0.8 of the straight grid's residual, two
onsets at least), and notes under 0.4 of a sixteenth dropped: 74 % to
95 % of the part's notes land on the right slot on the five 4/4 and 3/4
songs, 64 % on Downline, whose 5/4 and 3/4 bars the tracker reads on the
other subdivision 23 times in 186. Quantization is not where the line is
lost.

**Ask D.** Bars entirely right (every pitch, octave and slot, no extra
onset): Peaceful Dreams 34 %, Interbellum 25 %, Letter Lands 71 %, Eat
All the Clocks 35 %, Downline 29 %, Mop Heart 38 %; wrong (two errors or
more): 18 % to 54 %. The bench's judgment as a player: a line helps when
it is right in two bars of three and wrong in under one in ten; only
Letter Lands, a steady eighth-note part at 132, comes near, and its 18 %
wrong bars would still mislead. What predicts it in the stem is how much
the transcription over-segments: the share of transcribed onsets with no
note of the part behind them tracks the bar failure song by song, and
the app could measure a proxy without truth (transcribed notes starting
within a sixteenth of another of the same pitch class). The bench has
not tested that proxy.

**What would have to change.** The onsets, not the pitch: a rule that
merges a re-trigger of the same pitch inside a sixteenth of a sounding
note, and a ghost-note floor by loudness, would address the largest
failure class, and the bench can measure both against the same truth
on request. The stems here are Logic's rendering of the MIDI by a
sampled bass, clean and exact; a miked bass would do worse on every row.
The written `Bs` lines for every song and pipeline, and the truth's,
are in stem-bench results/study48-lines/ and parse in barmark 0.17 with
no error, so what the app would show from perfect notes sits beside what
it would show today.
