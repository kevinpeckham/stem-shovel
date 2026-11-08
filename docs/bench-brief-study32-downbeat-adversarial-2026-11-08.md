# Bench brief, Study 32: the downbeat vote against songs built to fool it

From the app (stem-shovel), 2026-11-08, after Study 31d. For the stem-bench
agent. The 31 family's open condition was a fifth and sixth real song, so
that the humility gate (no witness moves a correct base) could be tested
at all: on the four real songs the comb's own phase was wrong every time,
and the gate was vacuous. Kevin has no new recordings for a week or more,
and the app wants to ship the vote to production before that. This brief
asks for the gate's teeth from songs made for the purpose.

## Why rendered songs can answer this

The witnesses fail structurally, not acoustically: where the file starts,
where the chord changes fall, which beats carry the accents. A rendered
song controls each of those exactly, and the bench already has sixteen
hand-authored songs it synthesizes to audio with known chords (Studies 1
to 8). The four MMKK recordings can also be re-cut without changing the
music: pad or trim the start, and only time zero sees a different song
while the chord changes and the sections stay real.

## The set (all $0 except the optional re-draft arm)

Each item carries its true bar-one time by construction. Classes and the
vote exactly as registered in 31b (weights 2, 2, 1; the humility rule),
with the lead-corrected time zero of 31d as the time-zero witness, and the
app's extra gate: the chord changes alone decide only with a 1.2 ratio
over their runner-up. Report every witness per item, then the vote.

1. **Correct bases.** Renders whose downbeat carries the most onset
   energy (kick and bass on one, snare on two and four at 0.6), 4/4 at
   100, 132 and 180 bpm, 48 bars, chord changes on one every bar or two.
   The comb's class 0 should be the downbeat here, and this is the first
   time the gate "no witness moves a correct base" has anything to bite.
2. **Starts that are not a bar line.** The same renders with the file
   opened (a) on the downbeat, (b) one beat before it (a pickup), (c) half
   a bar before it, (d) 2.0 s of silence before it, (e) a four-click
   count-in at the song's tempo before it. Time zero must abstain or be
   outvoted on (b) to (e); report its class and distance on each.
3. **Harmonic rhythms that can fool the chord witness.** Changes on one
   and three equally (a two-chord bar throughout); one chord every two
   bars (changes on alternate downbeats); a one-chord vamp (no changes:
   the witness must abstain); changes on the "and of four" anticipations
   (the chord enters an eighth before the bar line, common in pop: does
   the per-beat vote still put the change on one?).
4. **Backbeat-heavy mixes.** Snare at 1.0, kick at 0.3, as Study 29's
   arm 1; here the base will be the backbeat and the vote must move it.
5. **Meters.** 3/4 at 140 and 6/8 at 72 (two dotted-quarter beats a bar;
   state which beat count the lattice uses), one item each from arms 1
   and 2(b).
6. **The four real songs re-cut.** Each MMKK mix (with its stems) padded
   at the start by 0.3, 1.0 and 2.5 beats of silence, and trimmed by 1.0
   beat. The chord runs re-read on the re-cut audio (the model is
   shift-invariant, so this costs a run of the pipeline, no model calls
   of the bench's own). Time zero's distance and class per cut, the vote
   per cut, against the 31d truths shifted by the same amount.

## Gates

- **S32-G1 (the humility gate, with teeth):** on every item whose base
  class is correct (arm 1, arm 5's arm-1 items, and any other where class
  0 is the truth), no witness that votes names another class, and the
  vote keeps class 0. One violation fails the gate and names the witness.
- **S32-G2 (no false moves):** across arms 2, 3, 4 and 6, the vote never
  decides for a class other than the truth. Undecided is allowed and
  reported as a rate per arm, not gated.
- **S32-G3:** the four real songs on their original cuts keep their 31d
  verdicts under the same code.
- Optional arm (≈ $0.15): re-draft letter and peaceful on arm 6's 1.0-beat
  pad to show the draft follows the moved bar one.

## What the app will do with the answer

G1 and G2 passing on this set is the app's condition for production in
place of the fifth and sixth songs; those become a confirmation when they
arrive. A G2 failure on an arm names a witness to down-weight or a case
to add to the "do not place" list (the app already skips songs with more
than one tempo or meter, or a tempo ramp). A G1 failure on arm 1 means the
base is worth more than the vote gives it, and the app would raise the
humility margin before shipping.
