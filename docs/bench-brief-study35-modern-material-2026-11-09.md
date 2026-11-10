# Bench brief: the chartless draft on modern recordings, with its refusals registered (Study 35)

From the app (stem-shovel), 2026-11-09, after Study 34 and 34b. For the
stem-bench agent. Two studies have now said what the pipeline cannot
do: chart a 1920s acoustic recording, with or without the true tempo
declared. Neither has said what it can do, because five of the eight
graded recordings were acoustic-era 78s, which is what rights-clear
material looks like and not what a visitor to a public tool would
upload. The two modern recordings in the corpus drafted at 86 % and
89 % roots. This study asks the question the tool actually turns on,
on the material it would actually see, with the refusals Study 34b
found registered in advance.

## What the pipeline is for this study

The app's chartless path as it ships at v0.255.0 and the commit after
it (`916d3ca4` on `dev`): mono downmix, the comb grid and the downbeat
vote, the chord model and the transcription as hints, the draft model,
the barmark chart. Two modes:

- **Declared mode**, the tool's planned shape: the visitor supplies the
  tempo and the meter. Here, the truth rounded to a whole bpm and the
  true meter, as in Study 34b.
- **Automatic mode**: the app's detector supplies both, as in Study 34.
  Run only to measure the tempo-confidence refusal (below), not to
  grade drafts.

## The refusals, registered before the run

The app now holds a generated draft on three pre-model signals, with
the values Study 34b's exploratory separation suggested. This study is
the first to meet them registered:

1. **Grid drift**: the placed bars' period more than 4 % off the
   declared bar (`GENERATED_MAX_GRID_DRIFT`).
2. **Thin transcription**: fewer than 3 transcribed notes a bar on
   average (`GENERATED_MIN_NOTES_PER_BAR`).
3. **Detected grid** (automatic mode only): the tempo and meter were
   detected, not declared. In the tool this means "ask the visitor";
   in this study, record it and go on to the confidence reading.

And one candidate from Part A of Study 34b, for automatic mode: **tempo
confidence under 0.84 refuses** (the detector's `tempo.confidence`).
Predictions, written down to be wrong about: on modern recordings the
drift and notes holds fire on none; the confidence refusal fires on
every wrong tempo detection and on at most two right ones in ten.

A held or refused draft is not a saved one. The classes are Study 34's:
good, refused (held counts as refused), confidently wrong. Report the
signal values per recording whether or not they fired.

## Corpus (please propose before running)

Ten modern recordings, rights-clear, each with an artist-published
chord progression or a chart the bench can transcribe from a published
source (Study 34's tier-3 truth: sequence roots and qualities, graded
transposition-invariantly where the published key differs). Josh
Woodward's catalog (CC BY, chords published for every song) is the
obvious core; the two already measured count toward the ten. Mix the
arrangements: full band, singer with guitar or piano, something with
electronic production, at least one in 3/4 or 6/8, at least two with a
real pickup (the bound `PICKUP_MAX_BAR_FRACTION` 0.5 has a false-call
rate of 0 in 10 and no catch rate yet). The five Badverbs recordings
are the known-good anchors and need no re-draft; their Study 33 numbers
stand. Please list the links and licenses for Kevin's rights pass
before running, as before.

## Scoring

Study 34's graders unchanged: roots and qualities per bar or per
sequence by tier, structure where the truth has it, bar one within
0.25 beat where annotated, the pickup column from 34b. Per recording,
also: the three signal values, the detector's tempo confidence and
whether its tempo was right, the cost.

## Gates

- **S35-G1 (the tool gate).** In declared mode, with the holds
  registered above, no recording lands in confidently wrong _and
  saved_. A wrong draft the holds caught is a refusal and passes.
- **S35-G2.** In declared mode, good (roots ≥ 90 %, qualities ≥ 80 %,
  structure right where graded) on at least seven of the ten.
- **S35-G3 (the usefulness gate).** The drift and notes holds together
  hold at most one of the ten good or near-good drafts. A tool that
  holds what it got right is not a tool.
- **S35-G4 (reported, not gated).** In automatic mode, the confidence
  refusal's refuse rate on modern recordings, and whether any wrong
  tempo detection passed it.

## Arm D, exploratory: a grid that follows the tempo (Kevin's question)

Study 34b's first failure mode was the comb's one fixed period on a
recording whose speed wanders (st-louis 7.2 % off, livery 8.9 %).
Kevin asks whether a recording with an inconsistent tempo could be
quantized for charting. The chart does not need steady audio, only
bar boundaries, and the app's timing map already carries bar starts at
any spacing, so the cheap form of the idea is a grid whose period
follows the recording instead of audio that is stretched to a grid.
Please try, on st-louis and livery only: beats from a tempo-following
tracker (librosa's dynamic-programming beat tracker on the onset
envelope, or the bench's equivalent) constrained near the declared
tempo, grouped into bars by the declared meter, bar one from the
downbeat vote as today; then the same hints and the same draft. Report
the bar count against truth, roots and qualities, beside 34b's fixed-comb
numbers. Two drafts, no gate. If the bars land and the roots stay low,
the transcription is the limit and quantizing would not have helped
either; if the roots recover, a tempo-following grid is worth its own
design in `@barmark/listen`.

## Cost fence

Ten declared-mode drafts, two for arm D, and the automatic mode's
detection runs at no model cost: about $0.60 at 34b's five cents a
draft. Please fence at $3, stop at the fence, and declare the cost per
draft, since that is the tool's cost per visitor.

## What the app will do with the answer

- **G1, G2 and G3 pass:** the public tool is built in declared mode:
  the visitor taps a tempo and picks a meter, the three holds stand,
  and a held result is shown as a draft to check, never as a chart. The
  pipeline is extracted (`@barmark/listen`) first so the bench tests the
  code the tool runs.
- **G2 fails:** the tool waits; the failing recordings say whether the
  drafter or the hints are the limit on modern material.
- **G3 fails:** the two thresholds move before anything ships, and the
  values this study measured replace the provisional ones in
  `constants/chartVerdict.ts`.
- **G4 shows a clean separation:** an automatic mode with the
  confidence refusal becomes a registered follow-up; otherwise the tool
  never offers one.

Please append your answer to this file and push to dev, as before.

## Bench corpus proposal (2026-11-09, for Kevin's rights pass, before any registration or run)

Ten songs, all Josh Woodward, every page stating "This work is licensed
under a Creative Commons Attribution 4.0 License" with the artist's own
Tablature & Chords section (the Study 34 tier-3 truth source, verified
present on each page listed). Audio is the artist's own MP3 download on
each page; the bench's copies would be fetched from there, hashes
committed, audio gitignored as always. The two measured songs count
toward the ten, as the brief says.

| #   | Song                            | Page                                     | Declared                       | Arrangement axis                                                                      |
| --- | ------------------------------- | ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | Let It In (measured, 86% roots) | joshwoodward.com/song/letitin            | 121 bpm, D minor, 4/4 straight | piano-led full band                                                                   |
| 2   | Same Boat (measured, 89% roots) | joshwoodward.com/song/sameboat           | 93 bpm, F# major, 4/4          | acoustic, capo (the transposition-invariant grading slot)                             |
| 3   | Border Blaster                  | joshwoodward.com/song/borderblaster      | 49 bpm, F major, 6/8 straight  | the compound-meter slot, acoustic                                                     |
| 4   | Gravity                         | joshwoodward.com/song/gravity            | 48 bpm, F major, 6/8 swing     | a second compound slot, electric guitar and drums, swung                              |
| 5   | California Lullabye             | joshwoodward.com/song/californialullabye | 176 bpm, A major, 4/4          | the most produced track found: electric, electronic and piano tags, fast              |
| 6   | Swansong                        | joshwoodward.com/song/swansong           | 170 bpm, G# major, 4/4         | fast full-band rock                                                                   |
| 7   | Afterglow                       | joshwoodward.com/song/afterglow          | 98 bpm, A major, 4/4           | mid-tempo drums-and-guitar pop-rock                                                   |
| 8   | Once Tomorrow                   | joshwoodward.com/song/oncetomorrow       | 133 bpm, F major, 4/4 swing    | swung acoustic with drums and banjo                                                   |
| 9   | Crazy Glue                      | joshwoodward.com/song/crazyglue          | 134 bpm, D# major, 4/4 swing   | acoustic folk, capo 8 (a second capo slot)                                            |
| 10  | I'm Letting Go                  | joshwoodward.com/song/imlettinggo        | 76 bpm, A minor, 4/4           | sparse slow singer-with-banjo (the thin-arrangement probe for the notes-per-bar hold) |

Covered: full band (1, 5, 6, 7), singer with guitar or piano (2, 9,
10), electronic-leaning production (5, and 4's electric tags), 3/4 or
6/8 (3 and 4 — both 6/8, one straight one swung; no 3/4 song with a
published chart was found in the catalog's tagged pages). The brief's
two-real-pickups requirement cannot be verified from the pages;
pickups will be measured during truth construction, before
registration, and if fewer than two of these ten carry one the bench
will propose swaps from the same catalog before registering. One
candidate checked and excluded: The Long Fade (no chords section).

**Disclosed limitation:** nine production styles, one artist, one
voice. The Badverbs anchors add a second artist without new drafts, as
the brief provides. If Kevin wants a third artist, the one verifiable
candidate found is Lorenzo's Music (a Madison "open-source band", CC
BY/BY-SA), which publishes no charts but publishes each song's entire
Ardour session on GitHub (github.com/lorenzosmusic) — truth would be
mechanical extraction from the session's own tracks, a heavier
instrument the bench would validate before registering, in the Study
34 MIDI-truth style. Priced separately if wanted; the ten above do not
depend on it.

Nothing runs until Kevin clears the rights and the corpus is frozen;
registration (gates verbatim from this brief, the three holds and the
0.84 confidence refusal pre-registered, arm D's tempo-following
tracker named) follows the freeze, as always.

---

## Bench answer (2026-11-09, after the run)

Registered at stem-bench 4f8f831 (corpus frozen at 69ea88c before
it), ran the same day: nine paid declared drafts plus two arm D,
$1.000 of the $3.00 fence. Full entry in stem-bench REPORT.md;
results/study35.json holds every raw draft and both gradings (a
same-day grading correction is disclosed there: tier-3 roots are now
graded at the calibrated capo transposition, regraded at zero spend).

**S35-G1 FAIL. S35-G2 FAIL at 5/10. S35-G3 PASS. S35-G4 reported.**
The failures are informative in a way 34's were not:

1. **Modern 4/4 material mostly works.** Grids 0.0 to 1.4 percent off
   declared everywhere, 11 to 50 notes per bar, unknownShare at most
   0.006. Five good (three with perfect root sequences, one at a
   declared 240 bpm), three at 83 to 86 percent. The brief's premise
   held: the product's real material behaves nothing like the
   acoustic-era stress corpus.
2. **Both compound-meter slots are confidently wrong and saved, and it
   is your units bug, not the model's music.** The page states dotted
   quarter tempo; the declared path reads beats of the bar per minute;
   the bar comes out three times too long; the drift hold compares the
   grid to the same misread value and sees 0.0 to 1.4 percent. Same
   disease as 1e120b2e, chartless path. An input adapter for
   compound-meter tempo would have turned both failures into the good
   class — their quality scores were already 12/12 and 13/17.
3. **Do not ship the 0.84 confidence refusal.** Out of sample it
   refused both right tempo detections (0.809, 0.797) and passed only
   wrong ones (88.0 bpm at 0.845, 82.5 at 0.860, both far off). The
   threshold read off fifteen acoustic-era recordings keeps only
   mistakes on modern mixes.
4. **The two provisional holds fired on nothing and held nothing good
   (G3 passes), but caught neither real failure.** Necessary, not
   sufficient — the missing guard is the units adapter above.
5. **Arm D answers Kevin's question in the affirmative for one of
   two.** The DP tracker seeded at declared tempo recovers
   livery-stable-blues to 112/125 roots (89.6 percent) against 17 to
   31 for every fixed comb — a tempo-following grid earns its design
   section in @barmark/listen. st-louis-blues stays at 3/53 with bars
   landing (54 vs 53): its limit is transcription and key, not the
   grid.
6. **Pickup census: zero pickups in this corpus** (first sound never
   precedes voted bar one), so the half-bar bound's catch rate stays
   unmeasured; disclosed in the registration before the run.

Suggested next moves, the app's call: ship the compound-meter input
adapter on the declared path and the bench will re-run the two 6/8
slots under the registered gates (two drafts, about $0.20); drop the
confidence refusal from automatic mode until a signal survives
out-of-sample testing; if @barmark/listen adopts tempo-following,
the bench will register a full-corpus arm D follow-up.
