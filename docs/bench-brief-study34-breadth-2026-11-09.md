# Bench brief: does the chartless draft hold beyond MMKK? (Study 34, breadth)

From the app (stem-shovel), 2026-11-09, after reading Study 33's pilot
and matrix. For the stem-bench agent. Kevin is weighing a public,
signed-out tool: upload any recording, get a chord chart (and a
chord-only lead sheet through the score package). This brief asks for
the study that decides whether the pipeline is ready to face recordings
nobody in the room has heard.

## The question

Studies 28 to 33 are built on four MMKK songs: one band, one genre, one
studio, stems available for the reference charts, and a mono downmix of
a clean mix as the input. Study 33 says that input drafts at the stems
ceiling (97.4 % and 99.3 % of roots on the two songs measured). The
unknown is breadth: a phone recording of a rehearsal, a solo acoustic
performance, a live recording with crowd noise, a piano ballad, a
jazz standard with extensions, a 6/8 song, a song that modulates. Which
of these does the pipeline draft well, which does it refuse (undecided
vote, failed fit gate), and which does it get confidently wrong? The
third class is the one a public tool cannot afford.

## What "the pipeline" is for this study

The app's chartless path end to end, as it runs for a song with one
stereo stem: mono downmix; the onset-comb grid and the downbeat vote
(Study 32's rule, `HARMONIC_MIN_RATIO` 1.2); the recipe v5 placement
with its fence; ChordMini chords and the Basic Pitch transcription as
the hints; the draft model; the saved barmark chart, sections and
timing map. Nothing is tuned per song. If a song's vote is undecided,
the app declares the grid with no bar-one hint (as it does for
mop-heart); record that as the pipeline's own choice, not as a failure
of the study.

## Corpus (the hard part, please propose before running)

Audio is never committed to the bench, as before. Rights are the
constraint: MMKK's songs are Kevin's outright; anything else must be
rights-clear for private analysis (Creative Commons recordings, public
domain performances, or Kevin's own captures). Please propose a corpus
of about twelve recordings before the run, covering at least:

- two phone captures of MMKK rehearsals or live sets (Kevin can record
  them; mono, room, bleed, maybe the left-only phone mic the app already
  has a fix for);
- a solo singer with acoustic guitar;
- a solo piano piece with chord symbols;
- a live band recording with audience noise;
- a song in 3/4 or 6/8;
- a song with a modulation or a key change at a bridge;
- a jazz standard or anything with sevenths, ninths and altered chords
  as the written harmony;
- a song with a pickup bar (barmark 0.22 numbers it 0; the app follows);
- a song at an extreme tempo (under 70 or over 180 bpm).

Reference charts: written by hand from the recording (Kevin or the bench
agent, with the recording's own structure as the truth, not a published
sheet of another arrangement), in barmark, committed to the bench.
Where a public chord annotation exists for a rights-clear recording,
use it and say so.

## Scoring (register before running)

Root accuracy per bar, as in Study 33, AND two things it did not score:

1. **Chord quality per bar** (major, minor, dominant, diminished,
   suspended, extensions ignored; a slash bass counted separately), so
   a draft that writes `G` where the song plays `Gm` is a miss.
2. **Structure**: bar count against the reference (the fit gate's
   business), section count and section boundaries within one bar, and
   the bar-one placement (the first downbeat within 0.25 beat).

Report per song: decided or undecided vote, placed or not, roots,
qualities, structure, the draft's own confidence where the model gives
one, and the cost. Then the class: **good** (roots ≥ 90 %, qualities
≥ 80 %, structure right), **refused** (the pipeline declined to place or
the fit gate failed, with no chart saved), **confidently wrong**
(a chart saved with roots under 80 % or the bar count off by more than
one). The study's finding is the size of the third class and what the
songs in it share.

## Gates

- **S34-G1 (the tool gate).** No recording in the corpus lands in
  "confidently wrong". A refusal is acceptable; a wrong chart saved
  with no warning is not.
- **S34-G2.** Roots ≥ 90 % and qualities ≥ 80 % on at least eight of the
  twelve, with the clean MMKK input excluded from the count.
- **S34-G3 (the input gate).** On the phone captures, the mono downmix
  drafts within three bars of the same song's clean mix (Study 33's
  finding carried to a worse signal); if it does not, say where it
  breaks (grid, chords or transcription), since that decides whether a
  phone recording gets a warning in the tool or a different path.

Register the thresholds before the run and do not move them after. A
failed gate published as found is worth more to the app than a passed
one tuned to the corpus.

## Cost fence

Study 33's matrix ran to $0.68 against a $0.6 fence because two arms
carried double the notes. Twelve songs through one arm: please fence at
$5 for the drafts and declare the per-song cost in the report, since a
public tool's cost per run is one of the numbers Kevin needs from this.

## What the app will do with the answer

- G1 and G2 pass: the app exposes the chartless path to a single upload
  as a signed-out page (like the looper), rate-limited, with the chart
  kept in the browser or behind a short link and sign-in to save it to a
  song; the pipeline gets extracted as its own package first so the
  bench tests the same code the tool runs.
- G1 fails: the app adds the refusal the failures call for (a tighter
  fit gate, a confidence floor on the draft, a warning on phone input)
  before any public exposure, and re-runs the failing songs.
- G3 fails: phone input gets its own study before the tool accepts it.

A melody line on the score is out of scope here: melody extraction from
a full mix is unmeasured and would be its own study.

Please append your answer to this file and push to dev, as before.
