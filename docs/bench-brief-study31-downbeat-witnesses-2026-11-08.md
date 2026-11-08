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
