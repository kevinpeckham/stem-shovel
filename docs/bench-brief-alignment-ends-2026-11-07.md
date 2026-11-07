# Bench brief — the chart alignment's weak first and last bars (2026-11-07)

From stem-shovel to the bench agent. The chart-to-recording alignment
(Study 12's chroma DTW, shipped in `src/lib/audio/chartAlignment.ts`)
gained a new consumer today, and that consumer needs the ends right where
the old one did not. This brief gives the observation, Kevin's hypothesis
about its cause, a proposed remedy and some alternatives, and the
measurements that would tell them apart. The deliverable is a finding and,
if one holds up, a recipe the browser worker can run.

## The observation

Until today the alignment had one consumer: placing the chart's sections
in the song's settings ("Place from chart", `utils/alignedPlacements.ts`).
Study 14's FIRST-ONSET and LAST-SOUND rules anchor the first and last
sections to the audible span, so a wobble in the first bars never showed.

Since v0.244.0 the alignment's bar starts are also kept as the chart's
timing map (`@barmark/sync`), and since today the player can follow that
map: the bar readout, the click and the sections all count on it
(`utils/barGridOfTiming.ts`). That exposed the ends. On Letter Lands
(MMKK; music from 0:00, 132 bpm 4/4, a declared bar of 1.82 s, a 142 s
recording, an 80-bar chart) the alignment produced:

|               | Declared tempo | Aligned     |
| ------------- | -------------- | ----------- |
| Bar 1         | 0.00 s         | 8.06 s      |
| Bars 1 to 7   | 1.82 s each    | 0.90 s each |
| Median bar    | 1.82 s         | 1.50 s      |
| Last bar ends | about 142 s    | 126.8 s     |

The path cost and tritone-control ratio passed the same-piece gates. The
map, followed, read "-8 | 3" at 0:00. The app now refuses such a map
(`utils/alignmentFit.ts`: bar 1 within one declared bar of the first
sound, the median bar within 15 % of the declared bar, the control ratio
at least 1.5), so the user sees a notice instead of a wrong grid. The
sections still place well, as the bench said they would.

## Kevin's hypothesis

Songs rarely start with every instrument. Letter Lands and many others
open with one or two parts and the drums come in later; many end with a
drone, noise or a sustain that rings past the last drum beat. Chroma DTW
is at its weakest exactly there:

- A sparse intro of sustained pads gives a flat, slowly changing
  chromagram. The reference render's bars 1 to 7 find no onsets to lock
  to, so the warping compresses them (0.9 s bars) and the path catches up
  to the first strong event at 8 s, which it calls bar 1's downbeat.
- A drone or sustain at the end keeps chroma alive after the chart's last
  bar; the path spends its last reference frames early and `subsequence`
  frees the tail, so the chart "ends" 15 s before the recording does.

The hunch to test first: the middle of the song, where the drums play, is
aligned well and the ends are not, and the cause is the sparse intro and
the ringing outro, not the DTW itself.

## The proposed remedy: steady tempo from the middle, re-evaluated at the ends

1. Align as today.
2. Measure the steady tempo from the interior: the median bar length over
   the middle 60 % of bars (or the bars whose local cost is under the
   median), which Letter Lands suggests is reliable.
3. Extrapolate that grid outward over the hazy intro and outro, from the
   last trusted bar in each direction, at the steady tempo (through the
   chart's own meter changes).
4. Re-evaluate the ends against the recording's events: onsets (spectral
   flux or the drum stem's envelope), not chroma. Keep the extrapolated
   bar lines that an onset confirms within a tolerance; where the
   recording has events the extrapolation misses by a consistent offset,
   slide the extrapolated grid to them (a tempo ramp or a pickup).
5. Anchor bar 1 to the first sound when the chart's first bar is meant to
   start the recording (`startAt` 0), as the section rule already does.

The output stays `barStarts` (bars + 1), so the app's worker and gate need
no new shape; a per-bar confidence that says "extrapolated, confirmed by
onset" vs "aligned by chroma" would be welcome and `@barmark/sync`'s
confidence record has room for it.

## Other ideas worth a look

- **Tempo-constrained DTW.** The current steps (1,1), (1,2), (2,1) let the
  path run at half to double speed anywhere. A slope penalty around the
  declared tempo (or the mid-song tempo from a first pass), stronger
  near the ends, would stop the 0.9 s bars outright. Cheap to try.
- **Two-pass render.** First pass as today; render the chart again at the
  measured steady tempo (not the declared one) and align once more with
  tight slope bounds. The reference then has the right bar length and the
  ends have less to make up.
- **Onset or multi-feature DTW.** Add an onset-strength channel to the
  chroma vector (or run a second DTW on onset envelopes and fuse), so a
  sustained pad with no attacks stops attracting the path.
- **Per-stem evidence.** The app has the stems. A drum stem's onsets give
  a beat grid directly where the drums play; the chroma path need only
  agree with it there, and the ends are extrapolated from it. The bench's
  MMKK set has the stems (Study 9).
- **Trim-to-drums ablation.** The direct test of the hypothesis: align
  against the recording cut to the span where the drums play (by hand or
  from the drum stem), then extend the result by count at the measured
  tempo. If the ends come right, the cause is settled.
- **A free start on the reference side.** When the chart's first bars do
  not describe the recording's intro (a chart that begins at the verse),
  let the path start at reference bar k and back-fill 1 to k-1 by count.
  Report when that happens; it is a different problem from a sparse intro
  and the app should say so.

## What to measure

On the MMKK real-recording set and the synthetic set:

- Per-bar error at bars 1 to 4 and the last 4 bars against the middle, as
  the bench's bar-start metric; today's numbers first as the baseline.
- How often bar 1 lands within one declared bar of the first sound, and
  the last bar's end within one bar of the last drum hit.
- The median bar length versus the declared, per song.
- For each remedy: the same three, plus whether the same-piece gates
  (ratio 1.6, local cost 0.30) still separate right from wrong charts.
- The cost: the worker runs in the browser, the warping is a few hundred
  million steps on a long song, and a second pass doubles it. Note what a
  remedy adds.

## Constraints for a recipe

No model: this runs in the browser worker from the decoded stems. Inputs
available there: the chart (bars, declared tempo and meter changes,
`startAt`), the mixed recording and the individual stems as
`Float32Array`, the chord pitch classes. Output: `barStarts` (bars + 1
seconds), `cost`, `controlCost`, `localCost`, `firstSound`, `lastSound`,
and optionally a per-bar confidence. The app's acceptance gate
(`alignmentFit`) is the bar: a recipe that gets Letter Lands through it
without loosening it is the goal.
