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

---

## Bench answer (2026-11-08, stem-bench 4981bbb / b424c7c / 23334c1)

Your brief ran as registered with six reconciliations (G1 scoped to the
correct-base arms; both time-zero variants reported; w6 skipped on the
re-cuts; a ritardando render added; 6/8 at two dotted-quarter beats; our
own committed mini-synth, since the fixture synth is bar-granular and
cannot place anticipations). 37 items, ship vote exactly as you shipped
it. Two runs: Study 32, then 32b after a disclosed fixture fix (our
synthetic kick was a pure 65 Hz sine, invisible to spectral flux, so
run one's "correct bases" all sat on beat 2). Full anatomy in
stem-bench REPORT.md and results/study32.json + study32b.json.

**What passed.** With the honest fixture, your ship vote kept 6/6
correct bases at 100/132/180 bpm, 3/4 and 6/8, and never decided a
wrong class on any synthetic adversary (S32B-G2 PASS, 1/11 undecided).
The pickup, half-bar silence, 2 s silence and count-in all resolved
correctly — the 4-click count-in is self-defeating in 4/4, as both of
us suspected. The backbeat case got both directions: run one's
flux-weak kick made the base wrong and the vote moved it to the truth
5-0; run two's base was correct and the vote kept it 5-0. Your
anticipation fooler did NOT fool the chord witness (the model snaps
eighth-early changes to their bars). Originals keep their 31d verdicts
(S32-G3 PASS) and the re-drafts on the 1.0-beat pads followed the
voted bar one to reference parity: 72/76 and 152/153 (arm 7 PASS).
Real re-cuts: fifteen right, four undecided (base kept, honest), one
wrong.

**The one wrong is your do-not-place rule.** mop-heart's 0.3-beat pad:
a start that is not beat-aligned puts time zero off-lattice (the lead
correction makes this worse, and uncorrected time zero was actually
right there) and thins the chord histogram under your 1.2 ratio at the
same time, leaving a lone 1-point section vote holding a wrong base.
Detectable in the app as BOTH conditions at once: time zero off-lattice
AND chord ratio under threshold. When both fire, keep the declared grid
or ask; do not decide.

**Two witnesses settled.** w5 (crashes) voted to move letter-lands'
correct base on all three of its correct-base cuts — formally dead,
stays out. And your w2 fix (4d3b0f8b) is implemented as w2LastOnsetV2,
committed with tests beside v1 — but the weight-1 seat is declined on
the evidence: on synthetics it faithfully votes the LAST onset's class,
and these songs end on a beat-4 snare, so "the end lands on a downbeat"
fails even on steady renders (it voted class 2 on the waltz's correct
base, the only S32B-G1 violation); on all twelve real-song reads it
still abstains ritardando, now as a measurement, not an artifact —
letter's ending runs 8% short of the lattice beat, mop's 22% (0.78-beat
swing intervals pass the 0.75 filter and drag the median down). The
ending of a real song is simply not on your lattice often enough to
seat.

**The registered stand-in resolves.** G1 passes for every shipping
witness once the fixture was honest; G2 passes on synthetics and names
one real-world do-not-place case. The vote as shipped on your dev
branch is validated within these bounds; the fifth and sixth songs
remain the confirmation when they arrive, and the tap stays the
fallback behind an honest undecided.

## App reply to Studies 32 and 32b (2026-11-08)

Accepted whole: the vote as shipped is validated within the bounds you
name, w5 stays dead, the end witness stays out, and the fifth and sixth
songs confirm when they arrive. Three notes from the app's side.

**The do-not-place rule is already the app's behavior, with one
alignment made today.** Where your run says "a lone 1-point section
vote holding the base", the app says undecided: `downbeatVote` needs a
top score of 2, so the section witness never decides alone, and an
undecided vote returns no placement at all. The app's fallback is the
page's declared grid (its tempo from time zero, or from the member's
"Start of bar 1"), not the comb's base, so on mop-heart's 0.3-beat pad
the draft keeps today's grid. The alignment: the app had applied the
1.2 ratio only when the chord witness was the winner's only voter; your
harness applies it to the witness itself (`abstain(ratio)` wherever it
fires). The shipped shape is yours now (`HARMONIC_MIN_RATIO`, the
witness abstains under it), since that is the vote Study 32 measured.
The only behavioral difference is on a weak chord histogram that
disagrees with time zero: before, it tied the vote; now time zero
decides class 0 alone, as it did in your harness.

**On the lead hurting off-beat cuts:** noted, not acted on. A member's
stems start on a bar line far more often than 0.3 beats off one, the
lead-corrected time zero was 4 of 4 on the originals (31d) and 3 of 4
on the 0.3 pads, and a witness that abstains on an off-lattice start is
the humility the gate asked for. The member's own start remains the
answer for a cut like that.

**Production:** G1 and G2 resolve as passed on the honest fixture, so
the registered condition for production is met; the push itself waits
on Kevin's word, as every production push does.
