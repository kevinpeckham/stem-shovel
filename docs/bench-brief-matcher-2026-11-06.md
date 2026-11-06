# Brief for the stem-bench agent: the chord matcher changed in stem-shovel v0.231.0 (2026-11-06)

From the stem-shovel agent, via Kevin. Two scoring rules in `chordsPerBar` / `chordOf` changed. Your fixture made the change measurable, and the real-recording measurement needs your machinery to be done properly. Nothing here has been registered on your side; this brief is the handoff, follow-ups are yours to decide and register.

## What changed (src/lib/audio/chords.ts, commit 748a3369, released in v0.231.0)

```ts
const PRESENT_SHARE = 0.12;   // was the literal 0.05
const MISSING_PENALTY = 0.12; // was the literal 0.08
const BASS_MIN_SHARE = 0.15;  // new

// chordOf: a template tone under PRESENT_SHARE of the bar's profile counts as missing
if (profile[pc] < total * PRESENT_SHARE) missing += 1;
const score = inside / total - 0.03 * Math.max(0, t.intervals.length - 3) - MISSING_PENALTY * missing;

// chordsPerBar: a note is the bass candidate only when it sounds for BASS_MIN_SHARE of the bar
n.pitch < 60 && overlap >= (to - from) * BASS_MIN_SHARE && (...lowest as before)
```

Everything else is as your v0.142 port (`src/fixture/chords.ts`), which I diffed against the app: identical but for TypeScript non-null assertions. Re-port from the v0.231.0 tag; the two rules are the whole diff.

## Why: two faults, found by re-scoring your stored notes

I ran the app's own `chordsPerBar` over `corpus/fixture.json`'s stored notes with `barStarts` from `src/fixture/synth.ts` and `sameChord` from `src/grading/symbols.ts`, as your `scripts/rescore-fixture.ts` does. The baseline reproduced your Amendment 2 number exactly, 424/440, so the comparison below is on the same footing.

1. **The bass pickup.** `chordsPerBar` took the lowest note under MIDI 60 as the bass whatever its length. The synth's bass anticipates the next section's root at the end of a bar (static-bloom bar 15: C#2 for 0.12 s of a 1.71 s bar; sawtooth-heart bar 15: F#2 for 0.01 s; seventh-street 0.04 s; harbor-lights bar 8: D2 for 0.03 s). That note got the +0.18 root bonus and the 0.5× profile boost, so the bar read as the relative minor seventh of the truth (E5 → C#m7, A → F#m7, Bb → Gm7, F → Dm7). Bar 15 of five songs, plus harbor-lights 8, night-orchard 15, blue-transistor 4.
2. **The harmonic leak.** Static Bloom's seven B5 bars carry B 63 %, F# 26 %, C# 10 % in the profile (the ninth harmonic of B, as Basic Pitch hears the synth). C# over the old 5 % line made sus2 explain 100 % of the bar against the power chord's 90 %, so sus2 won by exactly the leak. The line is 12 %, and the missing-tone cost is 0.12 so the penalty outweighs what the leak gains the wider template.

## Measurements

Synthetic fixture (exact grading, your rule), per configuration:

| present | bass | penalty | right of 440                    |
| ------- | ---- | ------- | ------------------------------- |
| 0.05    | 0    | 0.08    | 424 (your Amendment 2 baseline) |
| 0.05    | 0.15 | 0.08    | 432 (bass rule alone)           |
| 0.12    | 0.15 | 0.08    | 432                             |
| 0.12    | 0.15 | 0.12    | **439** (shipped)               |
| 0.15    | 0.15 | 0.12    | 439                             |

Bass at 0.10, 0.15 and 0.25 score the same on the fixture; 0.15 is the choice because of the real audio below. Static Bloom 20 → 28 of 28. The one bar still wrong is morning-fuse 21, truth N.C. with one F note in the profile (F 100 %); it was wrong before.

Real audio, APPROXIMATE: I had no raw notes for the Badverbs recordings, so I rebuilt per-bar notes from Study 13's `barNotes` lines in `results/study13-arm1.json` (`describeBars` text: `F#2×0.5@0.6` → a note at the bar's start sounding 0.5 s at 0.6). Notes under 150 ms and all start times are lost, so my baseline does not reproduce your stored run (48/76 vs 29/76 on letter-lands, same read in 59/76 bars). Treat the deltas as directional only. Graded strict-first with your power-chord allowance:

| configuration                                     | letter-lands (76)            | eat-all-the-clocks (86)      |
| ------------------------------------------------- | ---------------------------- | ---------------------------- |
| original                                          | 48 (strict 22, allowance 26) | 40 (strict 20, allowance 20) |
| bass 0.15 only                                    | 61 (23 / 38)                 | 42 (21 / 21)                 |
| bass 0.15 + present 0.12 / penalty 0.12 (shipped) | 59 (25 / 34)                 | 40 (23 / 17)                 |
| bass 0.10 + present/penalty                       | 51                           | 39                           |
| bass 0.25 + present/penalty                       | 63                           | 32                           |

The bass rule is the clear win on real audio (0.25 breaks eat-all-the-clocks, whose bass moves faster). The presence rule is a wash there: it wins strict power chords (letter-lands 38 D5 and 45 F#5; eat 35 E5, 43 A5, 52 A5) and loses majors with a weak third, now read as power chords (eat 20 D → D5, 21 A → A5), plus three letter-lands roots (50, 51, 64: F#m7/E → Esus2, Bsus2 → B5). I kept it because an under-claimed power chord is the better failure for a chart hint than a sus2 tone nobody played, and because this band writes power chords (74 of 76 letter-lands slots). That is a judgment, not a measurement.

## Follow-ups you may want (all mechanical, $0 unless you re-transcribe)

1. **Amendment over the fixture.** Re-port v0.231.0, run `rescore-fixture.ts` as a `matcher3PerBar` field beside the others, confirm 439/440, and note it in REPORT.md under Study 1. The v0.141/v0.142 fields stay.
2. **The real-audio measurement done right.** If Study 13 (or 9/14/17) kept the raw Basic Pitch notes for letter-lands and eat-all-the-clocks, re-run the three configurations above over them with your Study 13 grader (strict first, power allowance) and report whether the presence rule is net positive, neutral or negative on real audio. Gate suggestion if you register one: accept the bass rule on its own merits; keep the presence rule only if its net over both songs is ≥ 0, else recommend reverting PRESENT_SHARE/MISSING_PENALTY to 0.05/0.08 with the bass rule kept. If only the `barNotes` text survives, say so and skip; my reconstruction is not worth repeating.
3. **Study 10 is unaffected.** The ChordMini comparison stands on its own fields; nothing there used a live matcher. If you re-table it, the production matcher's column moves to 439.
4. **Study 13/14 reconciler cells** were computed from the stored v0.142 hints and need no re-run; a note that the hint baseline has moved is enough.
5. **A sweep worth one line each, if cheap:** PRESENT_SHARE 0.08–0.15 and BASS_MIN_SHARE 0.10–0.20 over the real notes. The fixture is flat across those ranges; the real recordings are where they separate.

Record anything you learn about real audio in your REPORT.md; the app's FINDINGS.md "AI features" has the stem-shovel side of this (2026-11-06 entry) and points at you for the real-audio amendment.
