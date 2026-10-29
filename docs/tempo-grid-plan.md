# Tempo as a grid, not a scalar — proposal from the bench

**Status: proposal** (stem-bench, 2026-10-29, after Studies 9 and 10
including the MMKK real-recordings amendment; measured numbers cite
the bench's REPORT.md). Nothing here is shipped; this is the bench's
recommended shape for retiring the program's single largest measured
error class.

## The problem, measured

The app represents a detected tempo as one number (`Detection.tempo.bpm`
in src/lib/audio/analysis.ts; the settings row stores one declared
value; the chart text says "bpm 132"). But a recording's tempo is
honestly a LADDER — the same beat grid counted at different levels —
and a scalar API forces the detector to pick a rung. Every
octave-family "error" in ten studies is that forced pick, not a
hearing failure:

- MMKK, real recordings: the detector read exactly HALF of Mop
  Heart's declared 224 (a fast waltz counted in eighths by the band)
  and exactly 2/3 of Peaceful Dreams' declared 145. Every metronome
  click at both readings lands on the audio; the grid was heard
  correctly, the rung disagreed.
- Synthetic: every 6/8 item read at 1.5× — structurally, because the
  meter vocabulary (`"4/4" | "3/4"`) cannot say "beats that split in
  three," so compound meter has no rung to land on.
- The literature names octave errors the dominant tempo failure class
  across all methods (ISMIR 2017 octave-metrics paper; the Study 10
  neural candidate carried the same classes).

No detector swap fixes this: Study 10 measured Beat This! small
against the production detector and the scalar comparison still
produced the same error families. The schema is the bottleneck.

## The proposal

Keep the declared settings exactly as they are (the band's number is
intent, and Study 7's parse-don't-ask rule stands). Change what the
DETECTOR produces and what the comparison does:

1. **Detected representation = grid + counting tuple.**
   - `beats: number[]` and `downbeats: number[]` (timestamps), when
     available;
   - `pulse` (the bpm of the rung the app will display),
   - `subdivision: 2 | 3` (straight vs compound/swung),
   - `grouping: 2 | 3 | 4` (pulses per bar),
   - `confidence` as today.
   `bpm` and the meter string become DERIVED views of this record
   (4/4 = subdivision 2 × grouping 4; 6/8 = subdivision 3 × grouping
   2 — expressible for the first time). Migration is additive: new
   optional fields beside the existing ones.

2. **Keep the summed-envelope autocorrelation as the period finder.**
   It survived every adversarial stem (Study 9) and beat the neural
   candidate on exact values (Study 10). Extend it with a subdivision
   test (energy at lag/3 vs lag/2, the same comparison meterLean
   already makes for grouping) so compound meter gets its rung.

3. **The grid itself, two tiers.**
   - Cheap tier: phase-lock a synthetic grid from the detected lag
     and the onset envelope's phase — adequate for steady songs, zero
     new dependencies.
   - Measured tier: Beat This! small (10 MB ONNX, MIT, browser port
     exists; beat F 0.892 at ±70 ms on the bench, honest near-silence
     on pulseless material) behind a lazy load, for real recordings
     that drift. This is the one Study 10 candidate that produced
     something the detector cannot (per-beat times); it is NOT a
     replacement for the scalar detector, which outscored it there.

4. **Ladder-aware comparison in the song-check and settings
   warnings.** Declared d matches detected x when d ≈ x, 2x, x/2, 3x,
   1.5x (and the subdivision agrees with the implied count). The
   mop-heart case then reads "matches, counted at half" — no warning —
   instead of a gross mismatch. Where a grid exists, the stronger
   check is mechanical: do the declared-bpm clicks land on detected
   beats?
5. **Display: a rung picker, not a verdict.** Show the chosen rung
   with its alternates ("112 — or 224 in eighths"); let the band's
   declared value select the rung when it sits on the ladder.
   Metronome, practice tools and Dawn consume the grid when present.

## What NOT to do (also measured)

- Do not replace the detector with the neural tracker for the scalar
  (it lost 29–18 at ±1 bpm; its win is the grid).
- Do not derive confidence from per-stem agreement (Study 9: maximum
  agreement on the study's only wrong answer). Disagreement between
  the autocorrelation rung and the tracker's grid IS worth surfacing —
  as a ladder question, not a confidence score.
- Do not touch the declared-settings data model; the band's number
  stays authoritative as intent, with per-label provenance (the MMKK
  amendment scored against it precisely because it was clean).

## Bench support on offer

Before any of this ships, the bench can register a zero-spend study
validating the ladder-matching rule against both corpora (the
synthetic fixture and the MMKK declarations): the rule's exact match
set, its false-accept risk (a genuinely wrong tempo that happens to
sit on a rung), and the subdivision test's accuracy on the 6/8 items.
Graders exist; the fixture exists; the cost is zero. Say the word in
FINDINGS or drop a draft brief in the bench repo as before.
