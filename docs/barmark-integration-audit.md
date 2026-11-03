# Barmark across Stem Shovel: an audit (2026-11-02)

Kevin asked, before the chord player gains a barmark export and a
humanize option, where else barmark (`barmark` 0.7.0, `@barmark/render`
0.7.0) could serve the app, and in what order. This is that audit:
what each surface holds today, what barmark offers it, and a priority.
It builds on docs/barmark-adoption-plan.md (the song chart, complete).
Barmark's own roadmap (its BRIEF.md: a CLI, a Nashville converter, a
conformance runner; Kevin, 2026-11-02: translators to and from MusicXML
and MIDI) decides which conversions the app should wait for rather than
write.

## What barmark offers now

- `parseChart` → bars, sections, diagnostics, every repeat expanded
  (`flattenBars`); `printChart` / `printParsed` → canonical text;
  `transposeChart({ to | semitones })`; `degreeOf(root, key)`.
- The chords module: `parseChord(symbol)` → a `ChordRecord` with root,
  intervals, pitches, bass, Harte label and canonical spelling;
  `printChord`; `toHarte` / `harteToBarmark`. Checked against the chord
  player's whole suffix vocabulary (`CHORD_RECIPES`: maj7, 7♭5, 7♭9, 6/9,
  °, °7, +, add9, sus2/4, 9, 11, 13, maj9, maj13, 5): every label parses,
  with `♭`/`♯` accepted and canonicalized (`Bm7♭5` → `Bm7(b5)`, `C+` →
  `Caug`, `Gadd9` → `G(9)`). `N.C.` is not a chord symbol (it is a slot
  kind), and `CM7` is refused with a suggestion.
- Directives: key, time, tempo, gradual tempo (`rit.`), **feel**
  (straight, swing, shuffle, swing 16).
- The renderer: `renderChart` HTML with a declarative shadow root, the
  `<barmark-chart>` element, numerals (Nashville, Roman), `wrap: false`,
  `speakChord` for screen readers, `layoutChart` → a `ChartModel` (every
  musical decision made, nothing drawn) that another drawer can consume.

## The surfaces

Ordered by value for the effort. Sizes: S under a day, M a few days,
L a week or more.

### 1. Chord player: Download menu with MIDI and Barmark chord chart (S–M, first)

Today (`src/lib/components/ProgressionPad.svelte:209`,
`src/lib/utils/encodeChordMidi.ts`): one MIDI button; tempo, a
`beatsPerBar/4` time signature, program 0, every note at velocity 90,
released a sixteenth early; no strum, arp, accent or feel. A saved
progression (`src/lib/val/ProgressionSchema.ts`) is `{ bpm, beatsPerBar,
entries: ({ kind: "chord", label, wedge, notes, beats: 1|2|4 } | { kind:
"rest", beats })[], style }`: **no key** (the key center lives in the
player's state and this browser's storage), no sections, no repeats, no
meter denominator.

What the export is: the progression as a `.chart.md`. `key:` from the
player's key center, `time: <beatsPerBar>/4`, `tempo: <bpm>`, `feel:
swing N%` from the shared swing (since barmark 0.9.0 and issue 4; bare
`feel: swing` at the triplet feel); one `## Progression` section (or the
pad's name); each bar's chords from the entries' labels (already barmark
spellings), `beats` becoming slots and holds (`| C . . . |` style is the
printer's business: build the text, hand it to `printChart` for the
canonical form), a rest as `N.C.`. Nothing new to store. Worth adding
in the same pass: `key` on `ProgressionDataSchema` (additive; defaults
from the player when absent), because a chart without a key cannot be
spelled in numerals and the bench's conformance fixtures all carry one.
The menu: the MIDI button becomes a Download `ContextMenu` with MIDI and
Barmark chord chart, MusicXML later when barmark's translator exists
(the app should not write its own). The file name follows the MIDI
one, extension `.chart.md`.

### 2. Chord player: humanize for progression playback (S)

Today (`src/lib/audio/progression.svelte.ts:434`): the pad schedules
exact onsets and a fixed release; velocity is the player's setting
scaled by `sqrt(3/notes)` with accent top/bottom; swing exists only for
arp and strum-pattern steps (`arpSwingDelay`). The app already has two
humanizers: the drum machine's (`drumRender.ts:42`, ±12 ms and a gain
dip) and the general `src/lib/utils/swingNotes.ts` (events in, timing
±30 ms × humanize, velocity ±0.2 × humanize, injectable random; the
Studio's MIDI tracks use it). Humanize for the pad is a setting on the
progression (`humanize: 0–1`, off by default, which also matches the
rule that nothing throws work away), applied in `#schedule` through
`swingNotes` so the pad and the Studio feel the same, and written into
the MIDI export as velocity and tick offsets so the download matches
what was heard. Not barmark work, but it pairs with 1 because the
export menu is where the setting's effect becomes visible. Barmark's
`feel` directive is the chart-side counterpart: when a chart is
imported (item 4), its feel and amount set the pad's swing
(`swingOfPercent`, 2026-11-03, stem-shovel issue 4 done).

### 3. The chart everywhere the chart already shows (S each)

- **Set list show page** (`SetListShowDoc.svelte`, charts through
  `ChartHtml`): add the chord spelling menu and, new, a **key** menu
  from `transposeChart` (Kevin's "view-level key choice"), because a
  singer's set is where a different key is wanted most. The same key
  menu belongs on the song page's Chords view.
- **Documentation PDF** (`src/lib/server/documentation.ts:61`): the
  chart is drawn as markdown through `markdownToPdf` (Helvetica and
  Courier), not as a chart. Draw it from `layoutChart`'s `ChartModel`
  with pdfkit (bars, bar lines, bar numbers, rehearsal letters), so the
  PDF matches the page. M rather than S if the renderer's typography is
  to be matched closely; a first pass of a grid is S.
- **charts.zip** (`documentation.ts:188`): `<song>-chart.txt` became
  `<song>.chart.md` holding `printChart`'s canonical text (done 2026-11-02).
- **Chat and comments**: plain text today; not worth a chart renderer.

### 4. Import a chart into the chord player (M) — done 2026-11-02

Shipped as `utils/chartToProgression.ts` (pure: bars to entries on a beat
timeline, durations rounded to whole beats and split 4/2/1, the circle
position from the key's parent major, warnings once each),
`progressionPad.importChart`, the pad's Import menu
(`ProgressionImport.svelte`), and Text-to-Progression answering in barmark
(`TextToChordsReplySchema.chart`, `parseTextToChordsReply` validating with
`parseChart`). The Roman-numeral reply format is gone.

The reverse of 1: paste or pick a song's chart, `parseChart` →
`flattenBars`, each bar's chords to entries by `degreeOf(root, key)` for
the wedge and the chord's `ChordRecord` for the label, beats from slot
counts quantized to the pad's 1, 2 or 4 (a limit to lift at the same
time or to warn about), `feel` to swing, `tempo` and `time` to the pad.
The AI Text-to-Progression (`src/lib/server/textToChords.ts`) then has
a simpler contract: ask the model for a barmark chart (as
`draftChartWithAi` already does for song charts) and import it through
this path, retiring the Roman-numeral JSON reply format and its parser
(`parseTextToChordsReply.ts`). One notation for every AI reply.

### 5. The AI's measure summaries become barmark (M) — done 2026-11-03

`readChartWithAi` (`src/lib/server/aiDetect.ts:166`) reads a PDF or
image score into the `m1 key C 4/4 tempo 120 … : C F | G` summary
format that `src/lib/utils/chartBars.ts` parses and members edit in
`SongNotationPanel`. That is a second chart grammar and parser in the
app. Ask the model for barmark instead (the prompt already exists for
drafts), validate with `parseChart`'s diagnostics, store it as a chart
the band can keep or edit with the barmark editor, and retire
`chartBars` and `ChartReadSchema` once stored reads are converted
(a one-time script, refuse-rather-than-guess as before). Alignment
(`chartBarsOf`) then has one source. The bench's conformance fixtures
guard the parser side.

**Parked 2026-11-02** until barmark can spell what a score read needs
(barmark issue 70): endings (reserved for grammar v0.2), directions
(D.S., D.C., coda, fine), a rehearsal mark on a bar, words on a bar.
barmark 0.10.0 (2026-11-03) answered the fifth ask: every played bar
carries `written`, its number as written, so a correction editor can
speak a printed score's measure numbers. barmark 0.11.0 (2026-11-03)
answered the first two: endings (`|1 … :|`, `|2 …`, `|1-3`) and
directions (Segno, Coda, To Coda, Fine, one D.C./D.S. jump) expand into
the played bars, which every reader of ours already consumes, and the
renderer draws them. barmark 0.12.0 (2026-11-03) answered the last two, rehearsal marks
(`| @B | D |`, `bar.rehearsal`) and words on a bar (`| "solo" D |`,
`bar.words`), and the renderer 0.9.1 numbers its margin by the written
bar (issue 92, fixed). Nothing in the grammar blocked item 5 then.

**Done 2026-11-03** (docs/audio-engine.md "The chart read is barmark"):
`readChartWithAi` asks for a barmark chart (every measure a cell, so the
written numbers are the score's), `parseChart` is the pass check, the
stored read aligns through `barmarkChartBars`, `chartStatedValues` and
`chartReadWarnings` read barmark, the editor shows barmark's errors live,
and `bun run db:convert-chart-reads` rewrites stored reads (round-trip or
refuse). `chartBars` and `ChartReadSchema`'s line rule are out of the app;
`chartBars` stays for the converter until production's rows are converted.

### 6. MusicXML scores get a chart (wait for barmark)

`chartBarsOf` answers `reason: "musicxml"` for an engraving: a MusicXML
score has no chart today, and `musicXmlSummary.ts` only skims
`<harmony>` for the AI. Barmark's MusicXML translator is on its
roadmap; when it ships, a score's `<harmony>` elements become a chart
through it, and the song page offers "Chart from score". Until then
nothing in the app should parse MusicXML into charts.

### 7. Studio markers from the chart (S) — done 2026-11-02; chart from the Studio (L, later)

`song.sections` (`[{ name, start }]`, names matching `## Name`) have no
path into the Studio's `markers` (`StudioSchema.ts:371`, `section:
true`). "Sections from chart" placing markers at the chart's section
starts (via the existing alignment, or evenly from tempo and bar counts)
is small and useful. The reverse, a chart from a Studio arrangement
(tempo map, meter and key changes, chord clips), needs chord detection
on MIDI clips (`nameChord` exists for the piano) and is for later, when
barmark's MIDI translator may do most of it.

### 8. One chord vocabulary (S) — done 2026-11-02 (Kevin: align all now, not opportunistically)

Done as `utils/displayChord.ts` (barmark canonical → the app's ♯/♭, °, +, with `flats` for a flat key) and `utils/intervalSemitones.ts`; `styledChordName`, `nameChord`, the piano readout, `ChordStyleEditor`, `chords.ts`, `musicXmlSummary.ts` and `chartToProgression.ts` spell through them, and `chordPitchClasses` reads with `parseChord` (its lexer is gone). Consistency tests hold every recipe, built-in style, `nameChord` entry, detector template and MusicXML kind to barmark's pitches. The dead `chordMidi`/`chordName` in `chordNotes.ts` went too.

`nameChord`, `chordPitchClasses`, `spellChord`, `styledChordName` and
the piano's readout each carry chord spelling knowledge. New code should
spell through `parseChord` / `printChord`; replacing the existing
utilities is only worth it where a bug or a mismatch with the chart's
spelling shows up (the renderer's power-chord fix in 0.7.0 is the kind
of thing one vocabulary avoids).

### 9. Ideas and the Idea Recorder (S) — done 2026-11-02 (Kevin asked)

An idea's notes are markdown "chords, lyrics, where it might go". A
chart field on an idea (rendered with `ChartHtml`, edited with
`ChartPreview`) would let a sketch carry its changes; the Idea Recorder
and the Studio stay separate, and this adds a document, not an
instrument. Only if Kevin wants it.

## Recommended order

1. Chord player Download menu: MIDI + Barmark chord chart, `key` on the
   progression (item 1).
2. Humanize on the pad, written into the MIDI (item 2).
3. Key menu (transpose) and chord spelling on the set list show page and
   the song page's Chords view; `.chart.md` in charts.zip (item 3, the
   cheap parts).
4. Chart import into the chord player and Text-to-Progression through
   barmark (item 4).
5. Measure summaries → barmark, retiring `chartBars` (item 5).
6. Documentation PDF from `layoutChart` (item 3, the PDF).
7. Sections from chart into Studio markers (item 7).
8. MusicXML and MIDI through barmark's translators when they ship
   (items 6 and 7's reverse).

## The three grammar questions, answered (2026-11-02)

Kevin asked for recommendations; the grammar draft (barmark
docs/grammar-v0.1-draft.md, sections 2.1, 2.3, 7.1 and 8) already decides
two of them, so these are readings of it plus one request. Kevin agreed
with all three (2026-11-02); filed on barmark as issues #64 (generators,
section 8), #65 (`N.C.`, section 2.3) and #66 (`feel:` a kind, section
7.1), with #62 (`(addN)` rejected) and #63 (an empty heading reads as a
replay) for the two parser findings.

1. **Durations within a bar.** A generator writes one slot per beat (the
   bar divided equally, `/` for a beat the chord holds through) and hands
   the text to `printChart`: the canonical printer reduces to the fewest
   even slots (`| C / / / |` → `| C |`, `| C / G / |` → `| C G |`) and
   keeps what cannot reduce (`| C / G D |`). A chord that crosses a bar
   line continues as `/` in the next bar. This is what
   `utils/progressionChart.ts` does. Recommendation to barmark: one
   sentence under section 8 saying generators should emit beat slots and
   canonicalize, so every tool arrives at the same text.
2. **Feel.** The grammar is right to make `feel:` a kind (straight,
   swing, shuffle, swing 16: where off-beat subdivisions land, 2:1) and
   not an amount. A swing percentage is a performance setting, which is
   what the app's session swing (0 to 1) is. Recommendation: keep it so.
   The app writes `feel: swing` when its swing is 0.5 or more (closer to
   a triplet feel than to straight) and leaves the directive out
   otherwise; on import, `feel: swing` sets the pad's swing to the
   player's default amount. **Superseded 2026-11-02:** Kevin reopened
   barmark #66 with a brief for an optional amount (`feel: swing 58%`,
   50% to 75% inclusive, `shuffle` takes one too, the `%` required);
   stem-shovel#4 holds the app's side (export `50 + 16.67 × s`%, import
   `(p − 50) / 16.67`, bare `swing` = 1, clamp above 66.7% and say so),
   blocked until barmark ships it.
3. **A rest bar.** `N.C.` (chord instruments stop, the band may go on)
   is the pad's rest: the pad is a chord instrument and knows nothing of
   the band. `--` (everyone stops) would claim more than the pad knows.
   On import both read as rests, and `/` after a rest stays a rest.
   Recommendation to barmark: a line in section 2.3 naming `N.C.` as the
   spelling a chord-instrument tool should emit for its own silence.
