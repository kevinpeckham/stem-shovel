# Brief for barmark: the recording-to-chart pipeline as a package

From the app (stem-shovel), 2026-11-09. For the barmark agent, who owns
the design and the build; this brief says what exists, what the evidence
is, and what the app needs. Where it sketches an API, that is a starting
point, not a decision.

## Why now

Stem Shovel can draft a chart for a song that has none, from its audio
alone: a bar grid from the onsets, bar one by a vote, the chords from a
chord model, the chart built by `chartFromDetections`, sections named by
a model, the timing map saved with it ("Generate chart from the stems",
v0.252.0). The bench's Study 33 found that a plain mono downmix of a
stereo file drafts at the stems' ceiling on both songs measured, so the
same path works for any single recording. Kevin is weighing a public
tool on that path, gated on a breadth study now with the bench
(`docs/bench-brief-study34-breadth-2026-11-09.md`).

Half of the path already lives in barmark: `@barmark/sync` builds the
chart and the timing map from detections on a grid. The other half, the
part that makes the grid and aligns a chart to a recording, is about
1,200 lines of pure functions inside the app, ported again by hand in
the bench. Three copies of the same math is the problem this brief asks
barmark to end.

## What the app has today, and where

All of it is deterministic TypeScript over typed arrays, with no DOM, no
audio decoding and no model runtime. Paths are in
`kevinpeckham/stem-shovel` under `src/lib/`.

| Piece              | File                                                                                                                  | In                                                             | Out                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Features           | `audio/analysis.ts`, `audio/chartAlignment.ts` (`recordingFeatures`, `chromagram`, `onsetEnvelope`)                   | mono PCM `Float32Array`, sample rate                           | onset envelope and its frame rate, chroma frames, first sound                 |
| The comb           | `audio/alignmentRepair.ts` (`jointOnsetComb`, `trustedSpan`, `combSlide`, `repairEnds`, `rephaseGrid`)                | onset envelope, a declared bar length                          | the bar period and phase the onsets support; a repaired or re-phased grid     |
| The chartless grid | `audio/chartlessGrid.ts` (`chartlessLattice`, three witnesses, `downbeatVote`, `placeChartlessGrid`, `chartlessGrid`) | features, chord runs, declared meter and tempo, optional start | bar starts, period, whether the downbeat vote decided, each witness's reading |
| Chart alignment    | `audio/chartAlignment.ts` (`renderChartPads`, `dtwAlign`, `alignChartPath`, `repairAlignment`, `alignChart`)          | a chart's bars with their chords, recording features           | when each played bar starts, a fit measure, a same-piece verdict              |
| Fit and placement  | `utils/alignmentFit.ts`, `utils/alignedPlacements.ts`, `utils/alignedTimingMap.ts`                                    | an alignment                                                   | the refusal reasons, section starts, a `barmark-timing` map                   |
| Constants          | `constants/chartAlignment.ts`                                                                                         |                                                                | 21 named thresholds, each with the study that set it                          |

Tests beside them: about 730 lines across `chartlessGrid.test.ts`,
`chartAlignment.test.ts`, `alignmentRepair.test.ts` and
`server/chartBuild.test.ts`.

Not in scope, because they are not barmark's kind of code:

- **The models.** ChordMini (a 170-class chord transformer, weights as
  JSON, run in the app's jobs function) and Basic Pitch (tfjs). They
  produce what barmark already accepts: `ChordRuns` and note events.
  The package should take their output as data and never import them.
- **Audio decoding and the downmix.** The app hands over mono PCM.
- **The model that names sections and corrects spellings**
  (`server/aiDetect.ts`). See "The refinement contract" below for the
  one part of it that is barmark's.

## The evidence the code carries

Every threshold in the constants file was set or confirmed by a
registered bench study, and the package inherits those obligations.
The ones a redesign must not lose:

- **Onset envelope lead, 70 ms** (`ONSET_ENVELOPE_LEAD_SEC`): Study 31
  found time zero 0.058 to 0.079 s off the uncorrected lattice on every
  song; every witness reads the corrected lattice.
- **The downbeat vote** (Studies 31, 32, 32b): witnesses time zero
  (weight 2, abstains beyond 0.25 beat), harmonic rhythm (weight 2,
  abstains under a 1.2 histogram ratio), sections (weight 1); decided
  when the top class scores at least 2, leads by 1, and beats class 0 by
  2 when it is not class 0. Study 32b: six of six bases right, real
  re-cuts 15 right, 4 undecided, 1 wrong. An undecided vote is a
  result: the app then declares the grid and places nothing.
- **Recipe v5** (Study 27 and the backbeat brief): the whole-grid
  re-phase onto the onset lattice with a half-beat fence
  (`REPHASE_FENCE_BEATS`), and the ends repair of Study 26c.
- **The same-piece gate** (`ALIGNMENT_SAME_PIECE_RATIO` 1.6 and the
  local-cost clause 0.3): the refusal that stops a chart being aligned
  to a recording of another song.
- **Mono in** (Study 33, final on two songs): no channel splitting, no
  mid/side, no harmonic-percussive separation. Mid/side lost six bars.
- **A known weakness**: a 65 Hz sine kick is invisible to the spectral
  flux (Study 32's first run failed on the bench's own fixture for this
  reason). Worth a fixture in the package's tests.

The bench's reports and fixtures are in `kevinpeckham/stem-bench`; the
app's own account of each piece is `docs/audio-engine.md` here, sections
"The chart placed by alignment", "The chart built from the detections"
and "The chartless grid: bar one from the stems".

## What the app needs from the package

1. **One call from features to a grid**, returning the `Grid` that
   `chartFromDetections` already takes, with the vote's verdict and the
   witnesses' readings beside it, so the app can show why bar one was or
   was not placed. Today: `chartlessGrid(input)`.
2. **One call from PCM to features**, so the grid's behavior does not
   depend on which caller computed the envelope. Today:
   `recordingFeatures(recording, sampleRate)`. It must run in a browser
   worker and in Node, and its output must be cacheable (the app keeps
   features per recording, `audio/alignmentFeaturesCache.ts`).
3. **One call that aligns an existing chart to a recording** and returns
   a timing map with its fit, or a typed refusal. Today: `alignChart`,
   `alignmentFit`, `alignedTimingMap`.
4. **Refusals as values.** Each stage answers with a result or a named
   reason (undecided vote, comb found no period, not the same piece,
   bar count off), never a throw. The breadth study's first gate is that
   no wrong chart is saved without a warning; the reasons are what the
   tool will show.
5. **A whole-pipeline entry point** for the simple case: mono PCM,
   chord runs, a declared or detected meter and tempo, and out comes the
   chart text, the timing map, the confidence record and the list of
   refusals or warnings. This is what a public tool and the bench would
   both call.
6. **No new runtime dependencies**, ESM only (the app's server refuses
   CommonJS at cold start), no DOM, typed arrays in and plain data out.

## The refinement contract

A model refines the built chart in the app: it names sections and
corrects spellings against the transcribed notes. Two rules in that
step are about barmark and nothing else, and they are enforced in the
app's remote function today (`remote/songs.remote.ts`, around the
re-hash): the refined chart must parse, and it must play the same bars
for the timing map to stay valid, in which case the map is re-hashed to
the refined text, otherwise it is dropped with a warning. A small
function in the sync package that takes the built result and a refined
text and returns the re-hashed map or the reason it was dropped would
let every caller apply the same rule. The prompt stays with the app.

## Questions the design should settle

- **Where it lives.** A new package (`@barmark/listen` is the working
  name here) or more of `@barmark/sync`? Sync is data in, chart out, and
  small; the features and the DTW are numeric code of a different
  weight. A separate package that depends on sync seems right from
  here, but it is your call.
- **The detections' shape.** The grid's harmonic witness reads the
  app's `ChordminiRuns` through `utils/chordminiBarChords.ts`. Sync
  already has `ChordRuns`. One shape, please, so the same detections
  feed the vote and the builder.
- **Meter and tempo.** The app passes a declared bar length and beats
  per bar, from the song's settings or a detector. A public tool has
  neither. Is detecting them the package's job (the comb searches near a
  declared period today, `COMB_RANGE_FRACTION` 0.1) or the caller's? The
  breadth study includes 3/4, 6/8 and extreme tempos, so its results
  bear on this; it may be worth waiting for them before fixing the API.
- **Pickup bars.** Grammar 2.4 numbers a pickup 0 and keeps `index`.
  The grid has no notion of a pickup: bar one is the first downbeat the
  vote finds. How should a recording that starts with a pickup be
  expressed in the grid and the built chart?
- **Constants.** Exported and overridable, or fixed? The bench needs to
  sweep them; the app should not.

## How the app will adopt it

The same way it adopted `@barmark/sync` in v0.244.0: pin the release,
replace the modules above with imports behind the existing tests, run
`bun run db:chart-check` on every stage, ship. The app's tests for these
modules are yours to take as a starting suite; the fixtures are
synthetic and carry no audio. The bench would then import the package in
place of its port, so a study measures the code the app runs.

Nothing here is urgent: the app works as it is, and the public tool
waits on Study 34. If the design wants to wait for that study's answer
on meters and phone recordings, that is a reasonable order.

Replies: an issue on `kevinpeckham/stem-shovel`, as with the pickup
change (#16), or an answer appended to this file.
