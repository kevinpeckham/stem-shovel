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
