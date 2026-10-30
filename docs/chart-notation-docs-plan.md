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

## Deliverable 3 (added 2026-10-30): the define-once form, and a warning until it exists

Kevin's original charts use the form musicians actually write: each
unique section ONCE under a numbered heading (`## I - Intro`), and a
Structure line giving the play order by numeral. The bench verified
two things against the shipped parser:

- Numbered headings survive intact ("I - Intro" comes through as the
  section name), so the numerals can keep tying chart sections to the
  app's sections data. No change needed there.
- **The Structure line is silently ignored** — a define-once chart
  parses with zero warnings into the wrong linear form (every section
  once, outline unexpanded). Fed to the alignment, that produces
  garbage placements or a false mismatch on a correctly written
  chart. Silence here is worse than an error.

Asks, in order:

1. **Now (one line): warn on an unexpanded outline.** A line matching
   a structure outline (a label like "Structure"/"Form"/"Order"
   followed by section numerals or names) should add a warning —
   "this chart lists a structure the app does not yet expand; write
   the sections in play order" — so the failure is loud until the
   feature ships.
2. **The feature: expansion at parse time.** Proposed semantics for
   `chordChartBars` (chartBars already plays repeats in play order,
   so this brings the two parsers to parity): a heading may carry an
   identifier (`## I - Intro`, `## II - Verse`); a Structure line
   (`Structure: I II III II III IV V II VI VII`, separators flexible)
   expands the chart in that order at parse time; a chart without a
   Structure line stays linear exactly as today; an unknown numeral
   in the outline is a warning and the outline is not applied (never
   half-applied). The revised Peaceful Dreams chart is the natural
   acceptance fixture — written define-once it should parse to the
   same 140-plus bars as its linear form.
3. The User Docs page (deliverable 1) then documents BOTH forms, with
   define-once as the recommended one for songs with repeating
   sections.

## Deliverable 4 (added 2026-10-30): Logic-style parentheticals — the 5 chord keeps no third

Kevin writes `G5(7)` in the Logic Pro sense: base quality 5 (no
third), parenthesized tones added — G, D, F. The shipped
`chordPitchClasses` almost agrees (parentheticals already add) except
the seventh piece brings the major third with it, so `G5(7)` comes
out G, B, D, F. The ask, one rule stated once: **the base quality
defines the triad — and `5` means no third — then parenthesized tones
are added to it.** `G5(7)` → root, fifth, flat seven; `F#(5)(7)` →
F#, C#, E; plain `G5` and `G7` unchanged; `no3`/`omit3` spellings
remain unnecessary. Backward compatible (nothing that parses today
changes except the 5-with-additions family, which currently parses
WRONG against the author's intent), Logic-compatible (a real-world
authority for the semantics, worth citing in the User Docs page and
the standard if it happens), and it retroactively corrects the band's
existing charts without an edit. chordPitchClasses.test.ts gains the
cases. The bench will mirror the rule in its grading allowances when
it registers the chord path next (the Study 13 power-chord allowance
extends naturally: an `X5(7)` truth accepts X7, X5 and X at the same
root).
