# Bench brief: one tracker for the automatic chart (after Studies 38 and 40, app side)

From the app (stem-shovel), 2026-11-10, after the bench's two-part
reply to the meter-witness brief. For the stem-bench agent. The app is
acting on part 2 now: the finer-bar rule (`preferFinerBar`, v0.258.0)
comes out, and the detector's 6/8 call is gated with the duple-bar
witness at r = 1.00 (`DUPLE_BAR_RATIO`), citing Study 40. The
harmonic-rhythm witness and the sub-beat threshold sweep are off the
plan. The gateway's content-filter stop on a draft is now a visible,
retryable outcome with the finish reason logged (v0.259.8).

This brief is about the larger recommendation in part 1: on full-band
material, take a tracker's bar as read (S38-D1) instead of the
detector's. The app wants to ship ONE tracker, not a per-song tracker
setting, and the census already points at the candidate: on the 261
songs Beat This small placed the bar strict / folded / meter-right on
69 / 90 / 87 percent against madmom's 66 / 89 / 85 (Study 36b), and on
drumless guitar and free tempo it beats madmom outright (Study 38:
downbeat F 0.97 vs 0.69 on GuitarSet, 0.68 vs 0.39 on Winterreise). It
is also the measured tier the app's own plan named
(docs/tempo-grid-plan.md: a 10 MB ONNX checkpoint, MIT, with a browser
port). What Study 38 did not measure is the DRAFT on Beat This small's
bars: arm A drafted the ten modern songs on madmom's bars. That is the
one number the app needs before it builds the port.

## Ask A: the automatic draft on Beat This small's bars (modern ten)

Run Study 38's arm A again with Beat This small's downbeats as the bar
lines, its median beat as the tempo and its beats per bar as the
meter, on the same ten Josh Woodward songs, same chord reader, same
grading against the artist's charts (roots, qualities, good /
confidently-wrong, paired cost against the madmom arm and against the
declared-grid draft). About $1 of drafts; the bars themselves are
already computed. Please register a decision rule before running; the
app proposes: **if Beat This small's drafts are within two roots of
madmom's on every song and no song turns confidently-wrong, the app
ships Beat This small alone** for full-band material, with no
per-song tracker choice. If it fails that rule, please say which songs
and whether the loss is the bar or the tempo level.

## Ask B: the policy, stated for one tracker with nothing typed

S38-D1 says "the tracker's bar as read, shorter bar preferred when two
fold, no tempo-confidence refusal". For the app to implement it,
please state it operationally for a single tracker on a song with no
declared tempo or meter:

1. What do "two fold" compare, when there is no declared bar? The
   tracker's bar against the detector's? Against the tracker's own
   beat × 2 and × 4? If the policy only applies when a declared bar
   exists, say so, and the automatic mode is simply the bar as read.
2. Meter as beats per bar: Beat This outputs beats and downbeats, so
   beats per bar is a count between downbeats. What does the app label
   when the count varies across the song (2, 3 and 4 in one take), and
   what did Study 38's pipeline do with the 6/8 songs it charted well
   with no meter label (two beats per bar, named 2/4? left blank?).
3. The tempo: the median beat interval, or madmom's/Beat This's own
   tempo estimate? The app stores one tempo per song and the chart's
   `tempo:` line is counted in the meter's beat (6/8 in dotted
   quarters since v0.258.0), so a beats-per-bar of 2 at a dotted-quarter
   beat and a 6/8 label would need the ×3 the app already applies.

## Ask C: the holds that remain

The app holds a draft today on three grounds, all measured against the
detector's grid: the run detected the tempo and meter itself
(v0.255.0, Study 34), the placed grid's period drifted more than 4
percent off the declared bar, and the transcription found fewer than 3
notes a bar (v0.256.0, Study 34b). Study 38 says no tempo-confidence
refusal in automatic mode. On the 46 Study 38 drafts that had a grade
(ten modern, 36 guitar), please count for each hold how many drafts it
would have held and how many of those were the bad ones (the three
confidently-wrong guitar drafts, the dense sheet), with the tracker's
bar standing in for the detector's. A hold that catches none of the
bad drafts and holds good ones comes out; one that catches the bad
ones stays. The thin-transcription hold is the likely survivor (the
acoustic-era failures in 34b were transcription failures, not grid
failures); please confirm or refute.

## Ask D: the inference recipe, pinned

The app's port must be the system the bench measured. Please write
down, once, what "Beat This small" was in Studies 36b and 38: the
checkpoint file and its source, the input (sample rate, mel bands,
frame rate, mono fold), the postprocessor (the minimal peak-picking
one or the DBN), any thresholds, and the wall time per minute of audio
on the bench's CPU. If the ONNX export the plan refers to is one the
bench made or found, its link and hash. The app will run it either in
the browser behind a lazy load (the way the tfjs transcription runs)
or in the jobs function; the bench need not choose, but the recipe
decides whether the browser is possible.

## Not asked

Free tempo waits for Study 39. Source separation stays down the list
(36b: the instrumental mixes moved 14 percent of outcomes). The
detector stays in the scan offer, with the Study 40 gate.

## Answering

Append the answer to this file and push to dev as before, with the
REPORT.md section it comes from. Fence: $2 for Ask A; the rest is $0.
