# Adopt barmark — brief from Kevin via the bench

**Status: brief for the stem-shovel agent** (2026-10-31). The chart
notation this app pioneered is now a standard with its own repository
(kevinpeckham/barmark), a binding grammar
(docs/grammar-v0.1-draft.md there; Kevin decides grammar questions),
a published parser (`barmark` 0.2.0 on npm, provenance-attested) and
a renderer (`@barmark/render` 0.1.0 in the workspace: HTML with
declarative shadow DOM and a `<barmark-chart>` web component; its npm
release is imminent — coordinate with Kevin). This brief asks the app
to adopt both and migrate its stored charts. It supersedes the parser
half of docs/chart-notation-docs-plan.md (details at the end).

## Why adopt rather than finish the in-app idiom parser

- The grammar evolved past the app's dialect: section ELISION (a bare
  repeated heading replays the section) replaced the planned
  Structure-line expansion, and the spec gained fermatas, directives
  and open repeats. Two implementations of a living spec will drift;
  the conformance story needs one.
- The bench verified the barmark parser is a SUPERSET of the app
  dialect: every committed app-dialect chart parses unchanged
  (letter-lands 76 bars, peaceful-dreams 152, the linear eat 86 —
  zero warnings). Nothing the app reads today is lost.
- The one thing it does not read is the legacy band idiom (the
  escaped-pipe, bold-label, Structure-line charts) — which is this
  app's storage artifact, not the standard's problem. Hence the
  migration below. (Known issue filed as barmark#1: that input
  currently parses to 0 bars with 0 warnings; the standard will warn,
  but the app should not rely on legacy input ever parsing.)

## Scope 1 — the parser

Consume `barmark` (^0.2.0) as THE chart parser in the production
path. `chordChartBars` retires; an adapter maps barmark's parse to
the app's `ChartBar` shape (chords, bpm, meter, key in force,
section) so `chartAlignment`, `alignedPlacements`, the ladder and the
song-check integration stay exactly as shipped and validated
(Studies 12–15). The summary-form parser (`chartBars`, for AI measure
summaries) is a different input and stays. The app inherits the
grammar's new powers for free — elision, fermatas, directives, the
unmeasured ring-out family — through the dependency, not through app
code.

## Scope 2 — the migration

A one-time script converting the STORED legacy-idiom charts to
barmark dialect: unescape the editor's serialization artifacts
(`\|`, `\*\*` — and fix the editor so it stops writing them, which is
the root cause), bold `**I - Name**` labels become `## I Name`
headings, Structure lines become play-order via elision. Rules:

- **Refuse rather than guess.** Any chart that does not convert
  cleanly is flagged for a human pass — the silent-failure lesson,
  three times earned. No best-effort conversions.
- Kevin confirms each converted chart in the app before it replaces
  the stored text.
- The bench grades the migration mechanically: it holds verified bar
  lists for all three sectioned songs (letter-lands 76 bars,
  peaceful-dreams 152, eat-all-the-clocks 71 in play order across 9
  sections, all grid-matched to the band's declared section starts).
  A migrated chart must parse to exactly those bars.

## Scope 3 — the renderer

Adopt `@barmark/render` for the chart display surfaces (the chart
editor's Rendered view, the song-page chart panel): the
`<barmark-chart>` element with the clean even bar grid and smart
typography, replacing any hand-rolled chart rendering. This also
retires the serialization quirk at its source if the Rendered view
no longer round-trips through escaped markdown.

## What this supersedes in chart-notation-docs-plan.md

- Deliverable 3 (Structure expansion) — superseded by the grammar's
  elision; the migration handles existing Structure charts.
- Deliverables 4–5 (Logic parentheticals; the unmeasured ring-out) —
  now grammar questions owned by barmark; verify the shipped
  behavior against the binding grammar rather than implementing
  in-app.
- Deliverables 1–2 (the user-docs page and the editor tooltip) REMAIN
  app work, now simpler: the page teaches the barmark dialect and
  links to the standard's own docs (barmark.dev when live); the
  tooltip links to the page; the parser's warnings surface beside the
  editor as planned.

## The trigger for Study 16

When adoption + migration land on dev, note the commit hash in the
CHANGELOG/FINDINGS as usual (suggested phrase: "the chart reads
barmark"). The bench then registers Study 16 against two pins
(barmark's published version + the adoption hash), three arms: the
reference parser against the bench conformance corpus with
cross-parser agreement vs the retired `chordChartBars`; the band's
stored, migrated charts through the production path (this arm also
grades the migration); and the placement + two-clause same-piece
gates (ratio ≥ 1.6 AND median local cost ≤ 0.30) re-run on the real
recordings through the new code.

## Asks back to Kevin (for the agent to surface when relevant)

- The `@barmark/render` npm release timing (the workspace version is
  ahead of the registry placeholder).
- Confirmation pass on each migrated chart.
- Any grammar question the adapter surfaces goes to barmark as an
  issue — Kevin decides grammar.
