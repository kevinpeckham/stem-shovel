# Writing a chord chart

A song's **Chart** is yours to write however you like, but a chart the app can read does more for you. It lets **Place from chart** in Song settings › Sections put the sections on the recording with no AI, it lets the app recognize the chart as this song's own when the stems are scanned, and it gives the detected chords something to be checked against. The readout under the chart tells you how the app read it: the bars and sections it found, and a warning for anything it could not follow.

## The header

Put the key, time signature and tempo on the first line, in any of these forms:

```
key: F#maj · 4/4 · bpm 132
Key: D · 145 bpm
Key of E major, 140 bpm, 3/4
♩ = 120
```

Keys can be written `Bm`, `key of E♭`, `Amaj` or `Emin`. Without a tempo or time signature, the song's own settings apply. A later key, tempo or time signature line (`key change -> B`, or a bare `2/4` before a short last bar) applies from the next bar on. The song's settings still hold the exact values the player uses.

## Sections

Each section starts with a heading line. Any of these works:

- A markdown heading: `## Verse`
- A whole line in bold: `**Verse**`
- A numbered label, bold or not: `II - Verse`, `2. Verse`
- A section word on a line alone: `Chorus`, `Verse 2`, `[Bridge]`, `Outro:`, or `Intro: D A` with the chords after the colon

With a heading, a numeral or bold, the name is up to you ("Part 1" is fine). A note in parentheses at the end leaves the name alone: `**IV - Outro (key change -> Bmaj)**` is a section called Outro, and the key change applies from there. `x2` in a heading plays the section twice.

## Bars

Write bars between pipes, `| D | A | Bm | G |` (the first or last pipe can be left out), between dots, `A・D・E・A` (`・`, `·` or `•`), or as a bare line of chords, one bar each.

- **Splitting a bar**: two or more chords in one bar share it equally. `| Am7 G |` is half and half, and four chords are the four beats of 4/4. Three chords in 4/4 are thirds of the bar, not beats, so to put a chord on beats, repeat it once per beat: `| Am7 Am7 Am7 G |`.
- **Repeating a bar**: `x N` right after a chord plays that bar N times (up to 64). `D x2` is two bars of D.
- **Repeating a line**: `x N` after the closing pipe plays the whole line N times. The pipe before the `x` is the difference:

```
| D | A x2 |      three bars: D, A, A
| D | A | x2      four bars: D, A, D, A
```

- **`%`** or **`/`** alone in a bar plays the previous bar again.
- **`--`**, **`-`** or an **empty bar** holds the previous chord. An empty bar is not silence: `| G | | | G |` is four bars of G.
- **`N.C.`** (or `NC`, `n.c.`) is silence, no chord at all: a drums-only break is `| N.C. | N.C. |`.
- **`|:` … `:|`** around one or more lines plays them twice.
- A word that is not a chord beside one (`| A5 riff |`) is ignored with a warning; a line of bars holding only words is left out, with a warning. Lines of lyrics or notes between the grids are skipped.
- A fenced code block (three backticks) keeps a grid's spacing exactly as you typed it.

## The Structure line

Write each section once and list the order the band plays them in on a line of its own:

```
Structure: Intro・Verse・Chorus x2・Verse・Chorus・Outro
```

The line can start with Structure, Form, Order, Arrangement or Play order, bold or not, with the list on the same line after a colon or on the next line. Separate the entries with dots, commas, pipes or arrows. Each entry is a section's numeral (`II`), its name (`Verse`) or the start of its name (`Out` for Outro), with an optional `x2`. If an entry names no section in the chart, or fits more than one, you get a warning and the chart is read in the order written. Without a Structure line the chart plays as written.

## Chord symbols

- A letter, an optional accidental (`#`, `b`, `♯`, `♭`) and a quality: `D`, `Am7`, `Cmaj7`, `Bdim`, `Dsus4`, `D(7)sus4`, `E5`, `C6/9`
- A bass note after a slash: `G/B`
- `sus` or `Sus`, either case

Parentheses add notes to the chord in front of them, and `5` means no third: `G5(7)` is G, D and F. Write `G5` for a bare fifth and `G7` for a seventh with the third.

## A worked example

```
key: D · 4/4 · 120 bpm

Structure: Intro・Verse・Chorus・Verse・Chorus・Outro

**I - Intro**
| D | A | Bm | G A |

**II - Verse**
| D x2 | A | Bm |
| G | A | D | -- |

**III - Chorus**
| G | D | x4

**IV - Outro**
| G | A | D | -- |
```

Each section is written once, and the last bar of the intro is half G, half A. The readout shows 40 bars in 6 sections: an intro of 4 bars, a verse of 8 (the D played twice, then the D held into the last bar), a chorus of 8 (its line played four times) and an outro of 4, in the Structure line's order.

For the editor itself, notation uploads and earlier versions, see [Charts, lyrics and notes](/docs/charts-lyrics-and-notes).
