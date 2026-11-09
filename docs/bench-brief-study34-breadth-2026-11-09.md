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

## Bench answer (2026-11-09): accepted, with the corpus proposal the brief asked for

The design is accepted as the registered core: twelve recordings, one
pipeline, no per-song tuning, the three classes with "confidently
wrong" as the finding, gates registered before the run and never moved.
Nothing below runs until Kevin approves the corpus, the fence and the
two items only he can supply. Reconciliations first, then the corpus.

### Reconciliations (registered deviations, same spirit as Studies 31 to 33)

1. **The pipeline is the bench's committed port**, as in every study
   since 23: the Study 23 production prompt, nchord as the disclosed
   ChordMini substitution, Basic Pitch per-bar notes, the Study 32 vote
   with the 1.2 ratio, the 31c placement rule, mono downmix in. When
   the app extracts the pipeline as a package, the bench re-pins
   against it; until then the port is what is measurable.
2. **Chord quality grades mechanically through barmark**, already a
   bench dependency: `parseChord().quality` mapped to the brief's
   classes (major, minor, dominant, diminished, suspended; extensions
   ignored; slash bass scored as its own column). The grader and its
   unit tests are committed before any run.
3. **Structure truths are hand-placed anchors with a stated method.**
   Bar count and section boundaries come from the reference chart; the
   bar-one truth for a wild recording is a hand-measured anchor
   committed with a diagnostic (the Correction 4 lesson: DAW exports
   start on bar lines, phone captures and 78s do not). Each anchor's
   derivation is committed beside the chart before the run.
4. **Reference charts: authorship is disclosed per song.** Where a
   public annotation exists for a rights-clear recording (the jazz
   slot below) it is used and cited. Where the bench agent writes the
   chart, it is written from the recording, committed before
   registration, and listed for Kevin's spot-check; charts Kevin
   writes are preferred for the MMKK captures. No chart is edited
   after the first scored run.
5. **"The draft's own confidence" is reported only where the schema
   carries it.** The production draft schema has no confidence field
   today; the bench will report the mechanical proxies it has (vote
   margin, fit-gate residual, hint agreement rate) rather than invent
   one.
6. **G3's pairing**: the phone captures should be of songs whose clean
   mixes already have measured drafts (letter-lands 97.4 %,
   peaceful-dreams 99.3 % from Study 33), so the within-three-bars
   comparison has a frozen baseline.

### The proposed corpus (twelve slots)

Audio fetched at run time, never committed; links and licenses go in
the registration manifest. US sound recordings published through 1925
are public domain as of 2026 (the Music Modernization Act's 100-year
term), which opens the 1920s jazz and dance-band catalog on the
Internet Archive.

1. **Phone capture, MMKK rehearsal: letter-lands** (Kevin records;
   mono room capture, bleed welcome). Truth: the band's chart, anchor
   hand-measured.
2. **Phone capture, MMKK rehearsal: peaceful-dreams** (Kevin records;
   if one capture naturally lands left-only, keep it — the app has
   the fix and the bench gets the worst case). Same truths.
3. **Solo singer with acoustic guitar**: a CC-licensed
   singer-songwriter recording (Free Music Archive or Jamendo, CC BY
   or BY-SA, picked at corpus-commit time with the license in the
   manifest). Chart hand-written from the recording.
4. **Solo piano**: a public-domain 1920s piano solo from the Internet
   Archive (stride or novelty, recorded ≤1925, e.g. James P. Johnson's
   own piano records). Chart hand-written; published lead-sheet
   harmony cited where one matches the performance.
5. **Live band with audience noise**: a Live Music Archive recording
   from a CC-licensed taper-friendly band, one song, crowd and all.
   Chart hand-written.
6. **3/4 or 6/8**: a public-domain 1920s waltz record (the dance-band
   catalog is full of them). Chart hand-written.
7. **Modulation at the bridge**: chosen from the PD standards so the
   key change is in the written harmony, not an arranger's liberty.
8. **Jazz with sevenths, ninths and altered harmony**: a recording
   from the JAAH set (Jazz Audio-Aligned Harmony: Internet Archive
   audio with published, time-aligned chord annotations) whose source
   record is PD by date. The public annotation is the truth, cited.
9. **Pickup bar**: chosen so the written melody starts before bar one
   (barmark numbers it bar 0; the chart will).
10. **Extreme tempo**: under 70 or over 180 bpm, from the PD pool
    (hot jazz runs well past 180; a 1920s ballad sits under 70).
11. **Interbellum** (Badverbs' own, non-public): the fifth song the
    program has waited for since Study 31's coda, and the one corpus
    song with a genuine ritardando — the end-of-song behavior nothing
    in MMKK exercises. Chart from the band.
12. **Clean MMKK control: eat-all-the-clocks** mono downmix, the one
    MMKK song with no chartless draft number yet; excluded from the
    G2 count per the brief, riding as the in-run control.

Slots 7, 9 and 10 may share recordings with 4, 6 and 8 if the picks
cover two categories at once; if so the freed slots take a second
singer-songwriter and a second live capture, keeping twelve distinct
recordings. Final links, licenses and the per-song truth authorship
table go in the bench registration (BRIEF-STUDY34) for sign-off before
any scored run.

### Fence and order of work

Twelve drafts at Study 33's measured per-song costs is ≈$1.20–2.00
(peaceful-sized prompts at ~27k tokens are the ceiling; no multi-buffer
arms this time). The $5 fence is accepted with room for the odd retry;
per-song cost will be in the report as asked. Order: (1) corpus
manifest + reference charts + anchors + the two new graders committed;
(2) registration; (3) one run, captures last so Kevin can record them
while the rest of the corpus is assembled. Needed from Kevin: the two
rehearsal captures (letter and peaceful), the Interbellum file and
chart, a rights pass on the final link list, and the fence go-ahead.
