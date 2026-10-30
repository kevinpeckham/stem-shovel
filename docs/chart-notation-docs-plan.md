# Chart notation: a User Docs reference page and a tooltip — brief from the bench

**Status: brief for the stem-shovel agent** (stem-bench, 2026-10-30,
at Kevin's request). Two deliverables now, one proposal for Kevin's
decision at the end.

## Why (measured)

Studies 12 and 14 made chart text a load-bearing input: the alignment
places sections, keys and tempi from it, the same-piece check judges
it, and the reconciled chords will be drafted against it. The binding
constraint is no longer hearing — it is whether the chart can be
parsed (Study 12 had to EXCLUDE one of the band's three charts as
untranscribable: ambiguous `x 8` scope, `・` separators instead of
bars, structure labels that didn't match the section headings). The
grammar `chordChartBars` reads is now machine-validated end to end
(Study 14 G1: bar-for-bar round trips), but it is documented nowhere
a band member can find. Peaceful Dreams is being revised by hand right
now with guidance that lives only in a conversation — that is the gap.

## Deliverable 1 — the User Docs reference page

A new page in scripts/user-docs (slug suggestion:
`writing-a-chord-chart`), seeded by `db:seed-docs` as usual, linked
from `charts-lyrics-and-notes.md` where charts are introduced. Content
is the SHIPPED grammar, stated as rules a musician can follow — the
bench validated every one of these against `chordChartBars` at
39c25b5:

- **Bars are cells between pipes**: `| D | A |` is two bars. Two
  symbols in one cell split the bar in half: `| F#5 Esus4 |`.
- **`%` (or `/`) alone in a cell plays the previous bar again**; an
  empty cell holds the previous harmony.
- **`x N` at the end of a line plays that whole LINE N times total**
  (N up to 8). The scope is always the line, never the last chord —
  say so explicitly; this exact ambiguity made a real chart
  unreadable.
- **`|: … :|` around lines** plays them twice.
- **`## Heading` starts a section**, and the heading names should
  match the Structure list one to one (the other real-world blocker).
- **`N.C.` is silence**; lyric lines under chord lines are fine and
  skipped.
- **Chord spellings**: letter + accidental + quality
  (`D7sus4`/`D(7)sus4` read the same; `♯`/`♭` are understood; slash
  bass `D/F#` works; `6/9` keeps its slash). One honest note: `G5(7)`
  is read as a G7 (the third included) — write `G5` for a bare fifth.
- **State the key, meter and tempo once at the top** (`key: D · 4/4 ·
  145 bpm` or any line saying `4/4` and `145 bpm`): the song-check and
  the alignment read them from the text (Study 7's
  chartStatedValues).
- A short worked example: the Peaceful Dreams Intro rewrite (two bars
  of D7sus4, one of C5, one of G5(7), eight more of D7sus4) in the
  explicit-rows and `%`-holds forms — the before/after is the best
  teacher.
- End with what good charts BUY the band, in one sentence each:
  sections placed on the recording with no AI, the chart recognized
  as its own recording, detected chords checked against it.

## Deliverable 2 — the tooltip in the chart text panel

An info tip beside the chart text editor (the KeepOnDevice info-tip
pattern): one line — "Bars in pipes, `%` repeats a bar, `x2` repeats
a line" — with "How to write a chart" linking to the docs page. Show
it wherever chart text is edited. If the panel already surfaces
`chordChartBars` warnings, the tip belongs next to them; if it does
not, surfacing `warnings` there is the natural companion change
(the parser already produces them line-numbered).

## Proposal for Kevin's decision — a public notation standard

There is no universal standard for text chord charts (the bench's
survey: ChordPro is lyric-anchored, iReal Pro is proprietary-ish,
Harte syntax is for labels, the bar grid is practice without a spec).
stem-shovel now has the only version of the bar-grid convention that
is PARSED, machine-validated against ground truth, and exercised by a
research program. That is the raw material of a small open standard:

- **Shape**: its own repository (spec as markdown, a conformance test
  suite distilled from `chordChartBars`' tests and the bench's
  round-trip fixtures, a tiny reference parser as a package — the
  shipped parser extracted or re-licensed) and a one-page site with
  the spec and a live "paste a chart, see the bars" validator.
- **License**: spec CC-BY, reference code MIT, following ChordPro's
  posture.
- **Name**: Kevin's call; working options that search clean enough —
  "bargrid", "chartline", "barchart notation" (the bench offers no
  strong opinion and notes the name is the only blocking decision).
- **Relationship to the app**: the User Docs page (deliverable 1)
  describes stem-shovel's dialect; if the standard happens, the page
  links to it and the dialect becomes "the standard, plus headings".
- **Why bother**: every improvement to chart quality raised the
  measured ceiling of three shipped features (Studies 12–14); a
  public spec with a validator is the cheapest way to raise chart
  quality at the source, and it is honest marketing for the app that
  parses it best.

The bench's part if this goes ahead: the conformance fixtures (the
round-trip corpus already exists in stem-bench) and a registered
validation of the reference parser against the shipped one.
