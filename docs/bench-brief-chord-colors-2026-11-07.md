# Brief for the stem-bench agent: Study 20, coloring ChordMini's roots from the notes (2026-11-07)

From the stem-shovel agent, via Kevin. Draft: register it with whatever numbers your corpus supports. ChordMini is the app's chord reader as of v0.236.0 (Study 19: parity exact). Its roots are right on 70/76 and 75/84 bars; its credit under the power-chord allowance is 59/76 and 53/86; strict-first it scores 0, because it never writes what this band's charts write: 74 power and 50 sus4 slots in letter-lands' 76 bars, slash basses elsewhere. The app has a second channel the model does not use, the server's Basic Pitch notes of the tonal stems (`song.notes_json`, the same transcription Study 18 re-ran). The question is whether the notes can dress the model's roots in the right colors without disturbing them.

## Hypothesis

With the root fixed by the model, the bar's note evidence can choose between the colors a chart distinguishes (power chord, major or minor triad, sus4, sus2, a slash bass) well enough that the strict score rises by a large margin while the root-level score does not fall. Sevenths stay the model's call: Study 17 (3) showed bar-pooled chroma through `chordOf` hallucinates sevenths (68/76 roots, 0/76 strict), so the notes must not be allowed to add a seventh the model did not hear.

## The candidate (what the app would ship)

A pure function the app would place beside `chordminiBarChords` (per bar, after the vote):

```
colorChord(root, modelQuality, profile, bass) → chart symbol
```

- `root`: the model's root for the bar (0–11), from its chart symbol.
- `modelQuality`: the model's quality from its 170-label vocabulary, reduced to one of `maj | min | 7 | maj7 | min7 | dim | aug | sus4 | sus2 | hdim7 | N`.
- `profile`: the bar's 12-bin pitch-class profile from the notes, built exactly as `chordsPerBar` builds it (`src/lib/audio/chords.ts`: each note's seconds inside the bar × amplitude, summed per pitch class).
- `bass`: the bar's bass pitch class under `chordsPerBar`'s rule (the lowest note under MIDI 60 sounding for at least `BASS_MIN_SHARE` = 15 % of the bar), or null.

Rules, in this order, with the constants from the shipped matcher unless you find better ones:

1. **No chord stays no chord.** `N` → `N.C.`. A profile with no weight → the model's symbol unchanged.
2. **The third decides the triad's dressing.** With `present(pc) = profile[pc] ≥ PRESENT_SHARE (0.12) × total`: for a model `maj` or `min`, if neither the major third nor the minor third is present and the fifth is, the bar is a **power chord** (`X5`). If the third is absent but the fourth is present, **sus4**; if absent but the second is present, **sus2** (mind Study 1's ninth-harmonic leak: a second at a tenth of the profile is the leak, under the 12 % line by design). If the third is present, the model's triad stands, and the notes may **flip major/minor only when the model's third is absent and the other third is present at twice the share** (a conservative flip; register how often it fires).
3. **Sevenths are the model's.** `7`, `maj7`, `min7`, `hdim7` keep their seventh; rule 2 may still turn a `7` whose third is missing into `7sus4` (the band's charts use it: "D7sus4"), nothing else.
4. **Slash bass.** When `bass` is not the root and is a chord tone of the chosen symbol, append `/Bass` (the matcher's rule needs `score > 0.55`; here the model's root is the score, so use the bass's own share: the bass pitch class must carry at least `SLASH_MIN_SHARE` of the profile, sweep 0.15–0.30). A bass that is not a chord tone changes nothing (a passing bass is not an inversion).
5. **dim, aug, sus4, sus2 from the model stand** unless rule 4 adds a bass.

The function never changes the root. If any variant of yours does, it is a different study.

## Arms

- **A0**: the model's symbol as the app ships it (the baseline: root-level 59/76, 53/86; strict 0).
- **A1**: `colorChord` with the shipped constants (PRESENT_SHARE 0.12, SLASH_MIN_SHARE 0.20).
- **A2**: A1 with the constants swept on the synthetic fixture only (the 440-bar corpus, where the truth has power chords and sus chords by construction), then applied unchanged to the real recordings. Report the sweep, pick by the fixture, grade on the real set once.
- **A3** (negative control): the matcher's own `chordOf` over the bar with the root forced to the model's (all templates on that root, the seventh allowed): the hallucinated-sevenths arm from Study 17, root-fixed, so we know whether rule 3 is what prevents it.

Notes channel: the app's server notes weight every tonal stem by its tonal share and do not exclude vocal-labeled stems. Study 17 (2) found a vocal stem pollutes merged harmony on eat-all-the-clocks. Run every arm twice on that song, with and without the vocal stem in the notes, and report both; if the exclusion matters, the app can tag stems by role (it already names them).

## Grades

- **G1, strict**: the symbol equals the truth after both go through barmark's normalizer (`F#5` ≠ `F#`, `D7sus4` ≠ `Dsus4`, `G/B` ≠ `G`, enharmonics equal). This is the score the study is for.
- **G2, root-level under the power-chord allowance**: Study 17's grade, the one that must not fall.
- **G3, color precision**: among bars whose root is right in both A0 and the arm, the share whose color is right; and the count of bars the arm colors wrong where A0's bare root would have been credited under the allowance (the cost of guessing).
- **G4, the flip count**: how many bars rule 2's major/minor flip fires on, right and wrong. If it is net negative on the real set, drop the flip from the candidate.

## Pass lines (register your own numbers; these are the shape)

- G1 on letter-lands rises from 0 to at least two thirds of the bars whose root is right (≈ 46/70); on eat-all-the-clocks, at least half.
- G2 does not fall by more than one bar on any song.
- G3's cost (bars lost from the allowance) stays under five per song.
- A3 scores below A1 on G1 (else rule 3 is not needed and the brief is wrong about sevenths).

## What to tell us

Per arm and song: G1–G4, the constants used, the flip's record, the vocal-stem comparison. The candidate's constants and the rule order you recommend, and any bar where the right color is not reachable from the notes at all (a sus4 the transcription never heard, say), so the app can set the card's hedge honestly. If A1 or A2 passes, the app ships `colorChord` on the page after the vote, keeps the reconciler off the model path (Study 17 G4), and the hedge changes from "never a power chord" to what you measured.

## Result (2026-11-07, stem-bench 9e55733)

Every gate failed, and the hypothesis is refuted as specified. Strict
reads 22/76 and 14/86 against pass lines of 46 and 38; root-level fell
from 59 to 55 on letter-lands and 53 to 33 on eat-all-the-clocks; the
cost of guessing was 4 and 20; and the negative control (the matcher's
own templates with the root forced, sevenths allowed) beat the candidate,
48 strict to 36, so the seventh fence was never the protective piece.

Why the notes cannot color these bars: the re-transcription's profile
shows a third or a fourth above the 12 % line on about 50 of
letter-lands' 74 power bars that the guitars never played (harmonic
smear and bleed, Study 13's artifact class), so the right color is
unreachable by any profile-threshold rule; the sus rules turned credited
triads into wrong sus chords (33 calls, none right); the slash rule
fired 14 times against zero slash truth; the flip fired 3 times, none
right. The vocal-stem split moved the candidate by one bar.

The app does not ship `colorChord`; the card's hedge ("never a power
chord or a slash bass") stays. The one asset the bench measured: the
power rule alone (root and fifth dominant, third, fourth and second all
absent) was right 22 of 23 times when it fired, worth about 22/76 strict
at a cost of about 1 as a hint on top of the model's reading, untouched
otherwise. That is a fresh brief if wanted, not a change to this one.
