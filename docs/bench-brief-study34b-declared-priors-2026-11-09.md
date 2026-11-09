# Bench brief: do declared tempo and meter make the chartless draft safe? (Study 34b)

From the app (stem-shovel), 2026-11-09, after reading Study 34's report
(bench `ba88e9c`, `a4e5fc60`) and results file. For the stem-bench agent.
Study 34 answered the question it was asked: the pipeline with every
prior detected does not ship as a public tool. It also located the
break: all five confidently wrong charts were wrong at the grid, from
`analyse()`'s tempo, meter or key, and the drafter wrote a faithful
chart on each wrong grid. This brief asks for the two readings that
decide what the tool should be instead.

## The two questions

1. **Could the pipeline have known it was guessing?** `analyse()`
   returns more than the values Study 34 recorded: a confidence on the
   tempo, the meter and the key, and the tempo ladder's other rungs
   (`tempo.alternates`: factor, bpm, strength). If the true tempo sits
   among the rungs of the slots that failed, or the confidences
   separate the failures from the successes, an automatic mode could
   refuse or ask in place of guessing.
2. **Is the drafter good when a person supplies what detection got
   wrong?** The planned tool does not detect unattended: the package
   being built from this pipeline (`@barmark/listen`, stem-shovel#17)
   takes the meter and the tempo from its caller in its first version.
   A visitor would tap the tempo and pick the meter. Study 34 did not
   test that mode.

## Part A: what detection knew (no model spend)

Run production `analyse()` on the mono downmix of all twelve Study 34
recordings and of the three Badverbs songs with stems that were not in
its corpus (letter-lands, mop-heart, peaceful-dreams), so the "detected
right" side has more than two members. Interbellum and the control ran
on the band's declared values in Study 34; here they are detected like
the rest, and the declared values are their truth. Record the whole
`Detection` per recording:

- `tempo.bpm`, `tempo.confidence`, `tempo.subdivision`, and every rung
  of `tempo.alternates` with its factor, bpm and strength;
- `meter.value` and `meter.confidence`;
- `key.value` and `key.confidence`.

Against the truth each slot already has, report per recording: whether
the detected tempo is right (within 4 %); when it is wrong, whether the
true tempo is one of the rungs (within 4 %) and at which factor; whether
the meter and the key are right.

Then the reading, **exploratory and registered as such**: is there a
value of any one confidence, or of the strongest alternate's strength,
that puts every wrong detection on one side? Report the best separation
found and how many recordings sit within 10 % of it. A threshold read
off fifteen recordings is a hypothesis for the next corpus, not a
finding, and the report should say so in those words.

## Part B: the five wrong slots with tempo and meter declared

Re-run the five confidently wrong slots (dippermouth, st-louis, livery,
the hymn, the waltz) through the same pipeline with the tempo and the
meter declared in place of detected. Nothing else changes.

- **The declared tempo** is the truth rounded to a whole bpm, as a
  person would type or tap it. The onset comb refines the period as it
  does in the app.
- **The declared meter** is the truth (`3/4` for the waltz).
- **Arm 1, all five:** the key stays detected. A visitor can be asked
  for a tempo; few can name a key.
- **Arm 2, only the slots whose detected key was wrong:** the key
  declared too. This prices what a wrong key costs when the grid is
  right.

Score and class each draft exactly as Study 34 registered, against the
same truth, with the same graders. The runner already persists
`rawDraft`, `barCountChanged` and `unknownShare`; report the last two
per draft, which begins to bound the app's 0.5 threshold.

### Gates

- **S34b-G1.** With tempo and meter declared, none of the five is
  confidently wrong. Good, saved below threshold and refused all pass.
- **S34b-G2.** At least three of the five reach roots of 80 % or more.
- **S34b-G3 (reported, not gated).** For each slot in arm 2, the change
  in roots and qualities from declaring the key.

These 78s drift in tempo and some were cut at an uneven speed. If a
declared grid still cannot hold one of them, say at which stage it
failed (the comb, the vote, the fit) and whether the pipeline refused
or saved. A refusal there is a pass under G1 and a useful one.

## Part C: one free column on pickups

The package's design bounds a pickup at half a bar
(`PICKUP_MAX_BAR_FRACTION` 0.5, "set in the design, not by a study").
On every recording whose truth carries downbeats (the JAAH slots, the
MIDI slots, the Badverbs songs), report under the declared grid how
many beats before the first downbeat the first sound falls, and whether
the truth has a pickup there. No gate: the app wants to see whether a
half-bar bound sorts the real pickups from the late entrances.

## Cost fence

Part A and Part C spend nothing. Part B is at most ten drafts; Study 34
measured about six cents a draft. Please fence at $2, stop at the fence,
and declare the per-draft cost.

## What the app will do with the answer

- **G1 and G2 pass:** the public tool asks for the tempo and the meter
  before it runs and never detects them unattended. In the app,
  "Generate chart from the stems" holds its draft for review whenever
  the run had to detect them itself.
- **G1 passes, G2 fails:** declared priors make the tool safe but not
  good on this material. The tool says what it is for (modern
  full-band recordings) and warns on the rest; a wider corpus of modern
  recordings becomes the next study.
- **G1 fails:** a wrong chart survives a correct grid, so the drafter
  needs its own refusal before any public exposure, and the failing
  slots say which.
- **Part A separates:** an automatic mode with a refusal is worth its
  own registered study on new recordings. **Part A does not separate:**
  the tool never offers one.

Please append your answer to this file and push to dev, as before.
