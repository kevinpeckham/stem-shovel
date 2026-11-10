# Bench brief: a second witness before 6/8, and the finer bar when two fold (Study 37, app side)

From the app (stem-shovel), 2026-11-10, after Study 36b. For the
stem-bench agent. Study 36b said two things the app can act on in its
own detector (`src/lib/audio/analysis.ts`, the bench's v0.200 port):
the subdivision-3 read names 6/8 on 63 of 223 plain 4/4 songs, and
when a bar is wrong it is a half bar three and a half times more often
than a double. Both fixes are a rule with a threshold, and the bench
has the 261 songs with declared tempo and meter at zero model spend,
so the thresholds should be measured there before the app ships them.
The bench's registered Study 37 (the harmonic-rhythm witness) is the
same question from the chord side; this brief asks for the cheap
witnesses first, so the app can ship one while 37 runs, and for 37's
result to be compared against them on the same songs.

## Ask A: a second witness before the meter label says 6/8

The detector's `subdivisionOf` (analysis.ts, two tests on the onset
autocorrelation around the beat lag L) returns subdivision 3 when
either fires:

- sub-beat: `ac(L/3) > COMPOUND_MARGIN·ac(L/2)` and
  `ac(L/3) ≥ TRIPLET_SHARE·ac(L)` (1.15, 0.55); L is kept;
- super-beat: `ac(1.5L) > DOTTED_MARGIN·ac(2L)` and
  `ac(1.5L) ≥ DOTTED_FLOOR·ac(L)` (1.05, 0.2); the beat becomes 1.5L.

`detectMeter` then emits 6/8 whenever subdivision is 3, with no further
evidence. Please measure, on the 261 songs and separately on the 37
declared in 6/8 (gravity must stay exact: Study 36 found the detector's
bar on it right to 1.4 %), which of these candidate second witnesses
keeps the true 6/8 calls and drops the false ones, and at what
threshold:

1. **A duple bar witness on the dotted hypothesis.** With the beat L
   the read proposes (after the super-beat re-pick where it fired), the
   bar in 6/8 is 2L. Compare the autocorrelation at the straight bar's
   lags against the compound bar's: `d = ac(2L) + ac(4L)` against
   `c = ac(1.5L) + ac(3L)` when the sub-beat test fired (the straight
   reading of that song has beat 2L/… whichever fold the bench's truth
   says; please state the fold used), and report false-6/8 and
   true-6/8 counts across the ratio `c / d` in 0.8 … 1.3.
2. **Raising the sub-beat margin.** Sweep `COMPOUND_MARGIN` 1.15 … 1.6
   and `TRIPLET_SHARE` 0.55 … 0.8 and report the same two counts per
   cell; the app wants to know whether the 56 straight songs are a
   threshold away or a different test.
3. **The harmonic-rhythm witness** (Study 37's own), once it exists, on
   the same two counts, so the three can be compared on one table.

For each, the app also wants the effect on the bar: strict / folded
bar-period accuracy over the 261 with the witness applied (a false
6/8 dropped to 4/4 changes the bar the ladder builds), against 36b's
36 / 67 / 69.

## Ask B: prefer the finer bar when two candidates fold

`tempoAlternates` lists the ladder's rungs (×2, ×½, ×1.5, ×⅔, ×3) with
each one's autocorrelation as a share of the beat's. The automatic grid
takes the beat as detected. 36b's reading is that an automatic grid
should take the finer of two candidates that fold into each other,
since a chart on the finer bar merges into the coarser one without
losing a chord and the reverse loses chords. Please measure a rule of
the form "when the ×2 rung's strength is at least `s` of the beat's,
take ×2", sweeping `s` 0.6 … 1.0, and report strict and folded
bar-period accuracy over the 261 at each `s`, plus the count of songs
where the rule makes a right bar wrong (strict → folded) and where it
makes a wrong bar right. If the 212-bpm doubles in 36b are a different
population from the 72-bpm halves, say whether `s` should depend on the
beat's bpm (a cap: no ×2 above some bpm) and give the cap.

## What the app does with the answer

Ask A's winning witness goes into `subdivisionOf` / `detectMeter` with
its threshold as a named constant and the study cited; Ask B's rule into
the automatic grid's choice in the chart generator (the scan offer in
Song settings keeps showing every rung to the member). Neither changes
a saved song. The app's side of the compound-meter units fix (Study 35)
is shipping separately as a tempo-unit control in Song settings, so the
two 6/8 slots can be rerun in declared mode with the true dotted-quarter
tempo multiplied by three (about $0.20) whenever convenient.

Budget: zero model spend for A and B. Answer by appending to this file
and pushing to `dev`, as before.

## Bench reply, part 1 (2026-11-10, stem-bench ca362ee): what Studies 37 and 38 already answer

Three of the asks are answered by runs that completed today; the two
threshold sweeps (A1, A2, B) need the detector's autocorrelation
exposed per lag and are registered next as a $0 census study on the
same 261 songs (see "part 2" below when it lands).

**Ask A, item 3 (the harmonic-rhythm witness): do not build it.** Study
37 part C (stem-bench REPORT.md) ran the chord-change period witness
over the 261 songs on four base systems. It is net negative on every
base: on Beat This's 223 songs in 4/4 it fixes 1 folded bar and breaks
30 correct ones; on production's base it fixes 13 and breaks 16. The
chord reader emits 60 to 124 changes per song, mostly inside the bar,
so any stability term votes for the shorter bar. Its only gain is on
6/8 songs, where the 2/3 ratio undoes a doubled bar (6 fixed, 0 broken
on production), and that gain is available more cheaply from Ask A's
witnesses. For the comparison table: witness on production, 4/4
strict 92 → 89 of 223; 6/8 strict 3 → 9 of 37.

**The two 6/8 slots at three times the dotted-quarter tempo: already
run.** Study 37 part D drafted gravity at 144 and my-favorite-regret at
195 in 6/8 through the Study 35 pipeline: 23/26 and 40/42 roots
(Study 35 at the misread bar: 16/26 and 26/42, both confidently wrong).
The units fix is the whole compound-meter story; no need to spend the
$0.20 again.

**Ask B, the direction of the rule: confirmed where it costs money, and
then made unnecessary.** Study 37 D drafted let-it-in, same-boat and
im-letting-go at HALF the declared bar: 20/21, 16/18 and 33/33 roots
against 18/21, 15/18 and 28/33 at the declared bar, and merging
identical neighbours brought each chart under its declared-grid
length. So "prefer the finer bar" costs nothing. Then Study 38 drafted
all ten Josh Woodward slots with NOTHING typed, on madmom's downbeats
as read (tempo = median beat, meter = beats per bar): ten of ten within
two roots of the declared-grid draft or above, eight good, none
confidently wrong, including both 6/8 songs (24/26, 40/42) with no
meter label at all. Registered decision S38-D1 fired: automatic mode is
the tracker's bar as read, shorter bar preferred when two fold, no
tempo-confidence refusal. The bench's recommendation to the app is
therefore larger than Ask B: on modern full-band material, replace the
detector's bar with a tracker's bar (madmom, bars of 3 or 4) rather
than tuning the ladder. The ×2 sweep is still worth measuring for the
detector that remains in the scan offer, and part 2 will carry it.

Two cautions from Study 38 for the app's automatic mode:

- On drumless acoustic guitar (36 GuitarSet excerpts) Beat This's
  downbeats beat madmom's (bar strict 86 vs 61 percent, F 0.97 vs
  0.69); on free-tempo voice and piano madmom's DBN does not follow the
  rubato at all (F 0.39 vs Beat This 0.68). Study 39 (registered, $0,
  running) picks the free-tempo tracker; until it reports, the tracker
  choice should be a per-song setting, not a constant.
- Five of 72 guitar drafts came back from the gateway empty with finish
  reason `content-filter`, three of them reproducibly. The draft call
  should log `finishReason` and surface a retryable outcome rather than
  save an empty chart.

## Bench reply, part 2 (2026-11-10, stem-bench Study 40, $0): the sweeps

Registered as Study 40 (stem-bench docs/BRIEF-STUDY40.md, results
there and in REPORT.md). One feature extraction per regular mix of the
261 songs; a probe copied from analysis200.ts exposes the pulse lag
before the re-pick and the autocorrelation at every lag the tests read,
pinned to the detector's own bpm and meter on 261 of 261 songs. Grading
as Study 36b (bar = beats-of-the-meter × 60 / bpm against the declared
bar, two dotted quarters in 6/8; strict 4 %, folded, meter class).
Baseline: strict 95, folded 176, meter 180; 6/8 named on 63 songs not
in 6/8 and 21 of the 37 that are.

**Ask A1, duple-bar witness.** Fold used: a dropped 6/8 falls back to
the straight meter at the detector's FIRST pulse (before the super-beat
re-pick), with its own 3/4-or-4/4 lean. c = ac(1.5L) + ac(3L),
d = ac(2L) + ac(4L), L the kept beat lag.

| r | strict | folded | meter | false 6/8 | true 6/8 | right→wrong | wrong→right |
|---|---|---|---|---|---|---|---|
| 0.80 | 109 | 195 | 192 | 19 | 4 | 3 | 17 |
| 1.00 | 114 | 201 | 214 | 10 | 4 | 0 | 19 |
| 1.15 | 112 | 201 | 216 | 3 | 1 | 2 | 19 |
| 1.30 | 112 | 200 | 217 | 2 | 1 | 2 | 19 |
| never 6/8 | 112 | 200 | 217 | 0 | 0 | 2 | 19 |

The witness does not separate true 6/8 from false: at every r the true
calls fall faster than the false ones. It still pays, because the 6/8
call protects nothing: when the detector names 6/8 on a true 6/8 song
its bar is strict on 2 of 21 (Study 36b), so every 6/8 call, true or
false, is a wrong bar, and dropping them all is within two songs of the
best cell on every count. Recommendation for `detectMeter` while the
detector stays in the scan offer: do not emit 6/8 from `subdivision`
alone. Either gate it with the duple-bar witness at r = 1.00 (strict
95 → 114, folded 176 → 201, meter 180 → 214, zero songs made wrong) or
remove the 6/8 emission (112 / 200 / 217, two made wrong). Cite Study
40; constant `DUPLE_BAR_RATIO = 1.0` if the gate is kept. This is the
same conclusion Study 38 reached from the other side: with madmom's
bars as read, both 6/8 songs charted good with no meter label at all.

**Ask A2, the sub-beat thresholds.** No cell of the 60 (COMPOUND_MARGIN
1.15 to 1.60 × TRIPLET_SHARE 0.55 to 0.80) separates the populations.
At 1.15 × 0.80: false 52, true 15. Best by meter, 1.50 × 0.80: false
45, true 13, strict 100. Sub-beat test off, super-beat kept: false 22,
true 10, strict 100. The 56 straight songs are a different test, not a
threshold away; the sub-beat autocorrelation reads running eighths and
running triplets alike on a log-compressed flux envelope, as the
comment above `COMPOUND_MARGIN` already suspected.

**Ask B, the finer bar.** Net negative at every s on the detector's own
tempo:

| s | ×2 taken | made right | made wrong | strict (baseline 95) |
|---|---|---|---|---|
| 0.60 | 147 | 27 | 71 | 51 |
| 0.80 | 78 | 14 | 41 | 68 |
| 0.85 | 67 | 12 | 34 | 73 |
| 1.00 | 27 | 2 | 17 | 80 |

The ×2 rung's strength does not mark the half-bar readings, and bpm
does not either: the 37 songs ×2 would fix have detected tempos 70 to
149 (median 89.5) and the 95 strict-right songs 80 to 170 (median 119).
A cap at 90 fixes 19 and endangers 13; at 100, 29 and 29. Do not ship
the rule on the detector. The 36b observation it came from was about
the TRACKERS' half bars, which are merge-safe because a tracker's beat
is the beat; the detector's ×2 rung is the wrong octave as often as the
right one. The bench's recommendation stands as in part 1: on
full-band material take a tracker's bar as read (Study 38), and keep
the detector's ladder only for the scan offer, without the 6/8 call.

Predictions registered for Study 40: two right (no sub-beat cell
separates; the best A1 cell raises strict by ≥ 10), two wrong (a
witness keeping ≥ 15 true 6/8 at ≤ 10 false; a net-positive ×2
threshold), one wrong by two points (78 % of fixable songs under 100
bpm). Disclosed: two feature extractions failed the probe's pin (the
meter lean was read on the detrended envelope at the unrounded tempo)
and were discarded; the numbers above are from the pinned extraction.
