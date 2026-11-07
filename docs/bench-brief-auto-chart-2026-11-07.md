# Bench brief — auto-writing barmark charts from a recording (2026-11-07)

From stem-bench to the stem-shovel agent. This is the reverse of the
usual flow: the bench measured the feature before it exists, end to end,
and this brief hands over what the data supports, what it rules out, and
the open leg. Receipts: stem-bench Studies 20 (2e523e6/9e55733), 20b
(7c40f9a/6c5e445), 21 (fbf1110/be046ce), 22 (0f2e02d/7466564/59fb180),
23 (6b0c0b5/9777689); verdict entries in this repo's FINDINGS.md under
"AI features"; full anatomy in stem-bench/REPORT.md.

## The feature in one paragraph

A song with a recording but no chart gets a drafted barmark chart from
the pipeline the app already ships: transcription (notes per bar), the
ChordMini reader (per-bar chord hints), and the chart-draft model. The
measured pilot (Study 23, four real songs, production prompt and call
shape) shows the MUSICAL layer already works, in places better than any
component alone, and names exactly two engineering steps between the
pilot and a viable feature. This would complete the chart-source trio:
manual, score import (v0.239), and recording-derived.

## What the data says works (keep these)

1. **The draft model's JSON is the asset.** On the pilot, the `chords`
   field was bar-exact on all four songs and carried the program's best
   chord numbers: peaceful-dreams 151/153 roots (above the reader's own 149) with 11 of 62 dialect bars EXACTLY right, mop-heart 131/140
   roots and 129 strict, letter-lands 72/76 (above its hint). The draft
   layer preserves or improves the reader's roots and recovers colors
   no code could write (Study 20's refutation): D7sus4 spelled strictly
   eleven times where the reader scores zero by vocabulary.
2. **ChordMini per-bar labels as the hint channel.** Roots 90.3 % across
   the whole charted catalog, 82–97 % per song, held-out included
   (Study 21). The reader never spells the colors; the draft does.
3. **The tempo ladder.** The shipped detector landed on a ladder rung of
   the declared tempo on all four songs; raw-octave grids score under
   30 % (Study 22). Any grid work must fold through the ladder.

## The two engineering steps (the actual work)

1. **Render the chart from the JSON by code; stop trusting model
   markdown as the document of record.** This is the whole reason the
   pilot's gates failed: peaceful's markdown chart used cell-level
   repeats ("| D5 x8 |") the notation does not define — invited by the
   draft prompt's own compact example ("D(7)sus4 · D5 x2") — and
   mop-heart's under-wrote its section repeats, losing 56 bars. The
   draft already returns bar-exact `chords` plus `sections` (name +
   start bar): build the barmark document from those fields with the
   barmark package's canonical printer and the result is parseable by
   construction. With this one change, three of the pilot's four gates
   would have passed as run. Constraining the prompt's chart examples
   to row notation is the weaker fallback, not the recommendation.
2. **The bar grid for a chartless song is the open leg — do not derive
   it blind.** Study 22 showed a uniform grid from tempo+meter+phase
   cannot even be CERTIFIED today (the bench's chart-anchored truth
   resolves bars to ~400 ms, coarser than the question), and the
   measured pilot ran grid-given. Ranked options:
   - **(a) Declared tempo + a user-set downbeat** (one tap or a
     count-in marker at upload). Cheap, product-shaped, and it supplies
     the phase the audio analysis cannot be trusted for yet.
   - **(b) Declared tempo + uniform grid, accepting degradation.** How
     much the draft's quality actually drops on a mis-binned grid is
     measurable for ~$0.31: the bench will run that arm under a fresh
     registration on request, BEFORE you commit either way.
   - **(c) Beat tracking.** Needs ground truth the bench does not own;
     human-tapped downbeats on one or two songs would unlock both the
     validation and (b)'s measurement at bar precision.

## Smaller measured items

- **One prompt example line with the `X5(7)` spelling** would likely
  convert the pilot's ten `G7`-for-`G5(7)` bars: the model hears the
  optional seventh on both the reader path and the draft path
  (Studies 21 and 23); only the spelling is missing from its examples.
  Keep the D7sus4 example — it is why 7sus4 recovery works.
- **The vocal-heavy regression.** eat-all-the-clocks was the pilot's
  one musical regression (roots 68/84 vs the hint's 74). Excluding the
  vocal stem from the draft's transcription input is a measured option
  worth an arm in the re-test (Study 20's vocal-split channel moved
  numbers in the same direction).
- **The card hedge stays** ("never a power chord / sus voicing" for the
  reader alone) until a re-test passes: the draft recovers colors, but
  11/62 strict is a start, not a card claim.

## What the data rules out (do not build)

- Coloring the reader's chords with code from the note channel: fully
  refuted, destructive on real audio (Study 20, all four gates).
- A density-blind power-chord hint: 81 % vs 0 % by arrangement,
  held-out (Study 20b).
- A blindly derived uniform bar grid as the feature's foundation
  (Study 22, above).

## Protocol for shipping

Implement in this repo (the bench never edits app pipelines). When the
chart rendering and a grid choice exist, ask the bench for the re-test:
it is a NEW registration (the Study 23 gates are the template — parse
validity, bar-count fidelity, roots ≥ hint − 5 pp, dialect recovery
≥ 10/62 — plus whatever arms you add, e.g. no-vocal transcription), and
the pilot fence was $0.31 of $2, so a full re-test stays under a few
dollars. Gates are set before the run and never re-thresholded; the
bench's prediction record on this arc (five for five wrong on the gated
channel of Study 23, every musical mechanism right) is part of why the
registrations exist.

---

## Addendum (2026-11-07, Study 23b): the grid ranking above is superseded

The "cheap measurement offered before any commitment" has now run
(stem-bench Study 23b, registered 6b2d599, results 259587d). Outcome:

- **Option (a), the user-tap downbeat, is measured DEAD — do not build
  it.** A simulated perfect tap (grid anchored at the aligned truth's
  first bar, period from the declared bpm) was the worst arm on every
  song: the declared tempo is a few percent off the recordings, and a
  uniform grid walks whole bars off the music within a dozen bars no
  matter how good the anchor is.
- **Option (b), uniform + measured degradation, is likewise dead** —
  the degradation is not graceful (roots drop 33–87 points per song).
- **The missing leg is the PERIOD, not the phase: measure the true
  tempo from the recording.** Cheapest candidate with zero new UX:
  take the shipped reader's chord-change times (chords change on bar
  lines in this catalog) and search phase AND period jointly — the
  bench's change-comb already anchors within 15% of a bar on 2/4 songs
  at the declared period and has an obvious 2-D extension. A
  music-start detector (first loud transcribed note) additionally
  catches uncharted intros (letter-lands' 7.15 s start, 121 ms error).
  If stem-shovel wants this leg measured before building, ask the
  bench; it is another registered study at pilot cost.

Everything else in this brief stands: the JSON draft channel, the
serialization fix (render the chart from JSON), the hint design, and
the do-not-build list.
