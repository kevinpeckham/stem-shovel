# Bench brief, Study 31: the downbeat from witnesses the song already carries

From the app (stem-shovel), 2026-11-08, after reading Study 30. For the
stem-bench agent. Study 30 closed with the one remaining bit for the
chartless draft, which beat is bar one, handed to the user as a tap.
Kevin wants a machine answer, so this brief names the witnesses that
have not been measured yet, most of them free, and asks for the vote
that combines them.

## The question

Three cheap scorers (raw comb phase, chroma novelty, kick-band onsets)
were each asked to find the downbeat from the beat lattice alone, and
none earned the right to overrule the base. All three read the same
thing, energy or change at beat granularity, and all three were blind
to where the song begins, where it ends, and what its chords do. Those
are the witnesses a musician uses. Can a vote among them find bar one
on the four songs, and refuse honestly where it cannot?

## What Study 30's own numbers already say

The truths registered there sit next to the file's first sample:
letter −0.121 s, peaceful −0.119 s, mop-heart −0.066 s, eat +0.415 s.
Three of four are within 0.12 s of time zero, and all were read
through the onset envelope, which reads early by about 0.07 s (the
addendum to the v5-backbeat brief, FINDINGS 2026-11-08), so the true
downbeats are nearer still. Eat's +0.415 s against a 0.50 s beat is
one beat in, less the same lead: the song opens with a one-beat pickup
or the export carries a one-beat pre-roll. The stems can say which.

That is the first witness, and it is not a coincidence. These
recordings are DAW exports, and a DAW bounces from a bar line of the
session, bar one most often. The song may enter a bar or two later, but
on a bar line. None of the three failed scorers used time zero.

## Witnesses (all $0, mechanical, on the Study 28 lattice)

Score every candidate shift (0..beatsPerBar−1 beats from the base
anchor; mop-heart is 3/4) by each witness separately, and report the
per-song table before any combination.

1. **Time zero.** The lattice beat nearest the file's first sample; the
   candidate whose bar line falls on it (within 0.25 beat). Report the
   phase of time zero on the lattice in beats, per song.
2. **The last strong onset.** The last onset above the song's median
   onset energy, before the ring-out (the audible span's end is the
   decay, not the hit). Songs end on a downbeat far more often than on
   any other beat: the fill fills the previous bar and the final chord
   lands on one. Snap it to the lattice and vote for the candidate it
   sits on. Report the local tempo over the last eight beats against
   the comb period: a ritardando moves the hit off the lattice and the
   witness should abstain when the two differ by more than 3 %. A fade
   (no onset above median in the last four bars) also abstains.
3. **Both ends together.** The beat count between the first onset and
   the last strong onset, modulo beatsPerBar. Zero means both are
   downbeats and the two agree; a remainder names a pickup at one end
   or a tag at the other, and the other witnesses break the tie.
4. **Harmonic rhythm.** The production chord model's runs
   (`song.chords_json`, `ChordminiRuns`: frame-wise labels run-length
   encoded, 2048/22050 s a frame). Every run start is a chord change;
   snap each to the lattice and histogram the changes modulo
   beatsPerBar for each candidate. The candidate with the most changes
   on its bar lines wins; report the margin over the runner-up. This is
   not chroma novelty: the model integrates whole beats with a musical
   prior, where frame novelty was mush. Ignore runs shorter than a beat.
5. **Crashes.** Onsets whose high band (above 5 kHz) is broadband and
   decays over more than a beat, unlike a hat. Count them modulo
   beatsPerBar; they land on one after a fill in nearly every rock or
   pop bar that has one. Report how many a song has; fewer than three
   abstains.
6. **The stems, where the fixture has them.** On a drum stem, snare
   hits (mid band, 150 Hz to 2 kHz, broadband) modulo beatsPerBar mark
   two and four in 4/4 and remove half the candidates; kick hits on
   the stem, not the band-passed mix, then decide one against three.
   On a bass stem, note onsets and pitch changes modulo beatsPerBar
   vote for one. A song without stems skips this witness.
7. **Section scale.** Beat-synchronous chroma with a checkerboard
   kernel of 8 and 16 beats, not one: section boundaries at verse and
   chorus changes. The peaks' positions modulo beatsPerBar vote; the
   repeat offset between the two choruses, as a check, is a whole
   number of bars.

## The vote

A weighted sum of the witnesses that did not abstain, weights set
before the run and written in the registration (a suggestion: time
zero 2, last onset 1, both ends 1, harmonic rhythm 2, crashes 1, stems
2, section scale 1). The humility rule from Study 30 stands: the vote
moves the anchor off the base only when the winner leads the base by
at least 2 points and leads the runner-up by at least 1; otherwise the
base stays and the song is reported as undecided. Register the weights
and the margin; do not tune them to the four songs after the fact.

Please also run time zero alone and harmonic rhythm alone as named
arms: if either is 4 of 4 on its own, the app wants to know that
before it wants the vote.

## Gates

- **S31-G1:** the vote's anchor is within 0.1 beat of the truth on all
  four songs, with no song undecided. (The hard gate.)
- **S31-G2:** no witness that did not abstain moved a correct base off
  the downbeat on any song, when run alone. (Any witness that fails
  this is reported and dropped from the vote, not re-weighted.)
- **S31-G3:** the re-draft on the voted grid reaches Study 28's
  reference accuracy within 5 points on letter and peaceful (81.3 % and
  61.4 % were the chartless numbers; 94.7 % and 98.7 % the reference).
- Report each witness's per-song table and abstentions whether or not
  the gates pass; a witness that is right 4 of 4 alone is a finding in
  its own right.

## Caveats the bench should hold against the app

- The truths carry the envelope's lead. If a witness that does not
  read the envelope (time zero, the chord runs) lands a steady 0.05 to
  0.07 s from the truth, suspect the truth, not the witness, and say so.
- Eat's +0.415 s: please listen to the stems or read the drum stem's
  first hit and say whether the song opens with a pickup or the export
  with a pre-roll, since the two ask for different handling of the
  time-zero witness in the app (a pickup keeps the bar line at time
  zero; a pre-roll moves it).
- Four songs are a small set for a vote with seven witnesses. If the
  vote passes, the app will ask for a fifth and sixth song before it
  ships the vote; if a single witness passes alone, that is the one
  the app ships first.

## What the app will do with the answer

The chartless draft keeps its machine-exact tempo and length, and
takes bar one from whichever of these passes: a single witness at 4
of 4, or the registered vote. The bar-one tap stays off the table
unless every witness and the vote fail, and then only as the fallback
behind an honest "undecided" rather than as the design.

## App review of Studies 31 and 31b (2026-11-08, stem-bench 5ee2ba6; 31c pending)

Read from results/study31.json, results/study31b.json, the 31b and 31c
briefs and scripts/run-study31b.ts. Three things to act on before 31c's
numbers are read as the family's result.

1. **The onset-envelope witnesses saw only the first 90 s of each
   song.** `extractFeatures(buffer, maxSeconds = 90)` (src/study9/
   analysis.ts) caps the envelope, and w2's `last` is 89.7 s on all
   four songs (letter runs 138 s, peaceful 254 s). The 31b "fade fix"
   could not help: there is no envelope after 90 s to find a last
   onset in. So w2 (last strong onset) and w3 (both ends) have not run
   in either study, and w6's kick, snare and bass histograms are from
   the first 90 s only. w4 (chord runs), w5 (RMS of the high band) and
   w7 (the chromagram) read the whole song and stand. Please re-run w2,
   w3 and w6 with the cap lifted for those witnesses before 31c's
   table is final; the vote's verdicts should not change (w4 and w7
   carry them), but the app wants to know whether the song's end is a
   witness at all, since it is the cheapest one after time zero.

2. **The time-zero distances are the envelope's lead, measured by a
   witness that does not read the envelope.** w1's distance from the
   nearest lattice beat: letter 0.174 beat = 0.079 s, peaceful 0.139 =
   0.058 s, mop 0.253 = 0.068 s, eat 0.140 = 0.070 s. Four songs, four
   tempos, one number: the 0.07 s the addendum to the v5-backbeat brief
   predicted. The lattice sits that far before the sound, so time zero
   is a downbeat on all four songs to within about 10 ms, and mop's
   abstention is the fence (0.25 beat) catching the lead, not the song.
   Please re-score w1 with 0.07 s added to the lattice: the prediction
   is four distances under 0.05 beat, mop voting, and A1 at 4 of 4. The
   same correction applies to every truth in the family (−0.121,
   −0.119, −0.066, −0.085 are all the downbeat at time zero read early),
   and to Study 27's residuals and the Mop Heart adjudication.

3. **Correction 4 is the time-zero prior confirmed, not a surprise.**
   The brief read eat's +0.415 s as a pickup or pre-roll; the stems say
   bar line at time zero, and the registered anchor was the ruler's
   error. The app takes the lesson: when a DAW export's first sample
   disagrees with a truth by one beat, suspect the truth.

What the app reads as settled, pending 31c: harmonic rhythm alone is 4
of 4 (margins 5, 29, 7, 35 changes; letter's is thin and the app will
want the margin reported as a confidence), section scale is 4 of 4
(17 of 18, 42 of 42, 6 of 11, 20 of 20 peaks), time zero is 4 of 4
once the lead is removed, and crashes are 1 of 4 and drop out. The
whole-bar placement defect (31c) also re-reads Study 30's peaceful
61.4 % as right class, wrong bar, which the app notes.

The app's likely shape, if 31c passes: the chartless draft takes bar
one from time zero (lead-corrected) when the chord-run histogram
agrees, and from the chord runs alone when time zero abstains; section
scale as the tie-breaker; "undecided" keeps the base. The bar-one tap
stays out.
