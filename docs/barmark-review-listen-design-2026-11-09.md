# Review of the `@barmark/listen` design, from the app

From the app (stem-shovel), 2026-11-09, for the barmark agent and Kevin.
Reviewed: `docs/superpowers/specs/2026-11-09-listen-design.md` on
barmark's `docs/listen-design` branch (the revision posted on
stem-shovel#17), read in full against the app at v0.254.0.

**Verdict: sound, and ready to build after two corrections and one
decision.** The spec keeps every threshold with its study, turns each
throw and each silent null into a named refusal, and its API covers what
the app calls today. The constants table, the fit's rules, the same-piece
gate, the hedge factor, the cell limit and the song check's declared bar
were each checked against the code and match. What follows is what does
not match, in order of weight.

## 1. A stated equivalence that does not hold: compound meters (§6.3, §11.3)

§6.3 says barmark's tempo rule "gives the app's seconds for every chart
the app keeps (6/8 at `tempo: 40` is 3 s, as the app's 6/8 at 120
eighths)". The second half is true only when the tempo comes from the
song. When the chart carries its own `tempo:` line, the app's adapter
(`utils/barmarkChartBars.ts`) hands barmark's `bar.tempo`, which counts
grammar 2.1's beat, to `chartBarSeconds`, which counts the numerator.
Measured on the app at v0.254.0:

| Chart                                    | App                | barmark's rule |
| ---------------------------------------- | ------------------ | -------------- |
| `time: 6/8, tempo: 40`                   | 9.0 s a bar        | 3.0 s          |
| `time: 12/8, tempo: 60`                  | 12.0 s             | 4.0 s          |
| `time: 4/4, tempo: 120`, one bar `[6/8]` | 3.0 s for that bar | 1.5 s          |

The spec's rule is the right one and the app is wrong. It is a latent
bug: no compound-meter song has been aligned from a chart with its own
tempo line, but every chart "Generate chart from the stems" saves has
one, and Study 34 carries a 6/8 slot. Two asks:

- **List it in §11.3** as an expected difference, with the package's
  value asserted, and keep those cases out of the exact goldens. As
  written, the equivalence run would fail on its own 6/8 fixtures with
  tempo lines and read as a porting bug.
- **The app fixes its adapter before the equivalence script runs**, so
  the goldens are taken from a correct reference. **Done the same day**
  (`1e120b2e` on `dev`): `barmarkChartBars` converts the
  chart's tempo, and the three rows above now read 3.0, 4.0 and 1.5 s in
  the app. Goldens taken from that commit on agree with barmark's rule.

## 2. Q1's precondition cannot be met as written (§12 step 7, §14 Q1)

The spec has `db:chart-check` count how many saved aligned maps the
stricter gate would refuse. A saved map holds its bars, starts, hash,
source and duration. The alignment's ratio and local costs are not
stored anywhere (`song.chart_timing`, `song.chart_confidence`), and the
gate needs the recording's features, which come from audio. The count
would take a re-alignment of every song with an aligned map, in a browser
worker today or in Node once the package exists.

Suggested reading: the stricter gate applies to new alignments, saved
maps stay as they are, and no count is a precondition. If Kevin wants the
number, it is a script written after the package ships (decode the mix,
run `alignChart`), not a chart check.

## 3. The pickup rule reaches further than a pickup (§7, §14 Q3)

As written, any decided grid whose first sound comes 0.75 beat or more
into the placed bar becomes a pickup, up to `beatsPerBar − 1` beats long.
An entrance on beat 2 of a 4/4 bar becomes a three-beat pickup and every
written bar number moves by one against how a band writes it, which is a
first bar with a rest. This is also the one place v1 changes the math
against its own non-goal, and the bench's bar-one truths in Studies 31c
to 32b were scored under "bar one holds the first sound".

Evidence from the app's stage: on the four dev songs with stems (Letter
Lands, Mop Heart, Peaceful Dreams, Interbellum) the first sound falls in
the first half beat, so `j = 0` on all of them and §7 moves nothing. The
corpus neither supports nor contradicts the rule.

Suggested answer to Q3: **yes, bounded.** Report a pickup only when it is
at most half a bar (`beatsPerBar − j ≤ beatsPerBar / 2`), through an
exported option marked "set in the design, not by a study", and let
Study 34's pickup slot confirm or move it. A longer lead-in keeps the
app's bar 1 with its opening silence. With `startAt` set by a person,
§7's rule is right as written: any sound less than a bar before it is a
pickup.

## 4. The declared fallback loses the reading (§6.4)

With `onUnplaced: "declared"` the result has `grid: null` and a
`bar-one-unplaced` warning whose `detail` names the reason. The
witnesses' readings and the scores are gone. The app shows them since
v0.254.0 ("the chord changes say beat 3, the recording's start says beat
1, the section changes abstain"), and the bench reports the vote margin
as its confidence proxy in Study 34. Ask: `RecordingChart` carries
`reading: GridReading | null` whether or not the grid was placed.

## 5. The time-zero witness on a recording that is not a DAW export (§13)

§13 lists this as open, correctly. It deserves more weight, because it is
the main way a public tool saves a wrong chart. When the other two
witnesses abstain, time zero alone decides: its weight 2 meets
`DOWNBEAT_MIN_SCORE`, leads by more than 1, and beats class 0 by the
margin of 2. On a recording that does not start on a bar line, time zero
lies within the 0.25-beat snap of some lattice beat about half the time,
and that beat is the downbeat one time in `beatsPerBar`.

v1 can already express the remedy with no new math:
`DOWNBEAT_WEIGHTS.timeZero: 0`. Two asks: say so in the README, and
consider an explicit input (`startsOnBarLine?: boolean`, default true,
the app's behavior) so a host does not have to know a weight trick. The
default and every bench number stay as they are.

## 6. Smaller points

- **`rehashTiming` and the confidence record (§8).** Agreed on the
  stricter meter rule. Please define "the same slot count" on the played
  slots barmark resolves, so a refinement that only changes shorthand
  (`%`, a hold written out, a repeat sign) does not drop the record. The
  app's refinement rewrites in the account's own style and will do this
  often.
- **Dropping `SPELLINGS` (§6.3).** Fine in principle. For the record,
  barmark 0.21 does not read six of the forms the table rewrote: `CM7`,
  `CSus4`, `CmMaj7`, `CmM7`, `C69`, `C(7)sus4`, and a Unicode minus. A
  stored chart that still carries one becomes a `?` slot that holds, with
  a warning. The app will run `db:chart-check` on every stage before
  adoption and fix what it lists.
- **The equivalence script reads a moving tree (§11.2).** The app's dev
  checkout changes under it: `chartlessGrid` changed its return shape
  today. Please run it against a `git worktree` at the commit it records,
  not the live checkout, and never write there.
- **Reason names.** The app shipped `no-input`, `undecided`, `no-fit` and
  `unavailable` today; the spec has `invalid-input`,
  `downbeat-undecided`, `nothing-fits` and adds `no-period`. No change
  asked: the app maps them at adoption and keeps `unavailable` for its
  own workers.
- **The unit of a placed tempo change (§6.3).** `Placements.tempoChanges`
  is "the app's, unchanged", but the app's `bpm` there is the song's unit
  (the bottom note) and the package reads barmark's. Please state the
  unit in the type (grammar 2.1's beat, like `Declared.tempo`, is the
  consistent choice) and the app converts at adoption. One trap the app
  just met: a bar with a one-bar meter of another bottom note has a
  different bottom-note bpm without the tempo having changed, and must
  not be reported as a tempo change.
- **Runs in seconds.** The app's interim reading rounds them onto the
  chord model's frame; the spec votes by covered time. The app never
  passes runs in seconds, so nothing depends on it, and the spec's is the
  better rule.

## Suggested answers to §14

1. **Should "not the same piece" refuse a map?** Yes, for new
   alignments, without the count as a precondition (point 2).
2. **An unplaced grid?** Refuse by default, as recommended; the app and
   the bench pass `declared`. With the reading kept (point 4).
3. **The pickup reading?** Yes, bounded at half a bar (point 3).
4. **Eighth-note pickups in compound meters?** Yes, as recommended.
5. **How strict is `rehashTiming`?** As recommended, with the slot count
   defined on played slots (point 6).
