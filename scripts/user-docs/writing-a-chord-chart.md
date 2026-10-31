# Writing a chord chart

A song's **Chart** is written in **barmark**, a plain-text notation for the bar grid musicians already write on paper. A chart the app can read lets **Place from chart** in Song settings › Sections put the sections on the recording with no AI, lets the app recognize the chart as this song's own when the stems are scanned, and gives the song check chords to compare against.

## The first lines

Start with the key, the time signature and the tempo, one per line (`key: D`, `time: 4/4`, `tempo: 120`) or on one line with commas:

```
key: F#, time: 4/4, tempo: 132
```

The key is a root, plus `m` for minor or a mode word: `F#`, `Em`, `D mixolydian`. A bare root means major, so write `F#`, never `F#maj`. When the chart has no tempo or time signature, the app takes them from the song's settings; a `tempo:` in the chart wins over the song's. A `key:`, `time:` or `tempo:` line further down applies from the next bar on.

## Title and sections

One `#` line is the title, and each `##` line starts a section that runs until the next one. Name sections whatever you like; a numeral is fine too.

```
# Letter Lands

## Intro
| F#5(7) Esus4 | x4

## II - Verse
| F#5(7) Esus4 | x8
```

## Bars

A line of bars starts and ends with a pipe, and each space between pipes is one bar. Four bars to a line reads well, but line length means nothing. An empty bar (`| |`) is an error: fill it with one of the symbols below.

Two or more chords in a bar share it equally: in 4/4, `| D A |` is two beats each. A `/` holds the chord before it for one more slot, so `| A / / G |` is A for three beats and G on four. Three slots in 4/4 are thirds of the bar, and the readout warns about them. Join chords with `_` to squeeze a quick run into one slot: `| D / / D_E_F#m |` plays all three inside beat four.

```
| D | A | Bm | G |
| D A | G D | A / / G | D / / D_E_F#m |
```

## Symbols inside a bar

- **`%`** alone in a bar plays the previous bar again, exactly: `| C G | % |` is C, G, C, G.
- **`/`** holds whatever was sounding: `| C G | / |` lets G ring through the second bar.
- **`--`** is silence: the whole band stops. A stop-time hit is `| G -- -- -- |`.
- **`N.C.`** is no chord: the chord instruments drop out while the drums, a riff or a voice carry on.
- **`?`** is a chord you have not worked out yet. It is allowed, and always warned about, so no gap goes unnoticed.
- **`...`** alone in a bar is a fermata: the last chord rings on. It is not counted as a bar.

```
| G | A | D | ... |
| N.C. | N.C. | A | ? |
```

## A bar in another meter

A time signature in square brackets at the start of a bar sets the meter for that bar alone; to change it for good, write a `time:` line.

```
| D | A | [2/4] G | D |
```

## Repeats

- `x4` after a line's closing pipe plays the line four times.
- `## Chorus x2` plays the whole section twice.
- `|:` at the start of a line and `:|` at the end of one (in the same section) play the bars between them twice, or `:| x3` three times.
- `x ...` is an open repeat: a vamp until the cue, or a fade-out at the end.

```
## Chorus
|: D | A |
| Bm | G :|
| E7 | / | x ...
| A | ... |
```

This chorus plays its four bars twice, vamps on E7 until the cue and ends on a ringing A.

## The form of the song

Write each section once, then list the headings in the order the band plays them. A `##` heading with no bars under it plays that section again.

```
## Verse
| A | D | E | A | x4

## Chorus
| G | / | A | / |

## Verse
## Chorus
## Verse x2
```

Capitals do not matter, but the rest of the name must match: `## Verse 2` is a new section, not a replay of `## Verse`, and an empty heading that names no earlier section is an error. Lyrics under a replay heading are fine.

## Chord symbols

- A capital letter, an optional `#` or `b`, and a quality: `C`, `Cm`, `C7`, `Cmaj7`, `Cm7`, `Cdim`, `Caug`, `C6`, `C9`, `C13`
- `sus2` or `sus4` after the rest: `Csus4`, `C7sus4`
- A bass note after a slash: `C/E`
- Tones in parentheses are added exactly, as Logic reads them: `C(9)` is C, E, G and D; `Cm7(b5)` is half-diminished
- `5` means no third: `C5` is C and G, `C5(7)` is C, G and B♭

`C2` and `C4` are refused (players read them two ways); write `Csus2` or `C(9)`.

## Lyrics and notes

Any other line is text: lyrics, cues, a reminder about the ending. It stays in the chart but is never played or scanned for chords.

```
## Bridge
Watch Kevin for the cutoff
| Em7 | A7(b9) | Dmaj7 | Bm7 |
```

## When something will not read

A line the app cannot read is shown underlined, with its message, and left out of what plays; the rest of the chart still reads. The readout under the chart lists what was read (the bars, the sections and the song's length) and any warnings, each with its line number.

## A worked example

```
key: A, time: 3/4, tempo: 224

## Intro
| A | D | E | A |

## Verse
| A | D | E | A | x4

## Chorus
| G | % | % | % |
| A | % | % | % |

## Verse
## Chorus

key: B
## Outro
| B | E | F# | B | x2
| B | ... |
```

The readout shows 61 bars in 6 sections: an intro of 4, a verse of 16, a chorus of 8, the verse and chorus again, and an outro of 9 in B; the fermata adds no bar.

## If you wrote charts before

Charts in the app's earlier notation were converted where that was safe. If you know the old way: `Chorus:` or `[Bridge]` is now `## Chorus`; an empty bar is now `/`; a lone `/` that repeated the last bar is now `%`; `key: D · 4/4 · 120 bpm` is now `key: D, time: 4/4, tempo: 120`; and a Structure line is now a list of `##` headings. `N.C.` now means only that the chords stop; for the whole band stopping, write `--`.

For the editor itself, notation uploads and earlier versions, see [Charts, lyrics and notes](/docs/charts-lyrics-and-notes).

## The standard

barmark is an open notation; its full grammar and tools live at [github.com/kevinpeckham/barmark](https://github.com/kevinpeckham/barmark).
