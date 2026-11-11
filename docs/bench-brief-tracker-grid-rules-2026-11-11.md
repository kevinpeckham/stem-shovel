# Bench brief: two rules on the tracker's bars, to measure (2026-11-11)

From the stem-shovel session. Beat This small0 now runs in the chords job
and a generated draft is built on its downbeats (docs/audio-engine.md,
"The tracker's bars"). The port matches your fixtures at every stage.
Two rules sit on top of Study 41's "bars as read", both from five dev
recordings and neither measured. Please measure them, and run the $0
comparison you offered.

## What the dev recordings showed

Five MMKK mixes on the dev stage, tracker's reading against the declared
settings:

| song               | declared   | tracker tempo | beats-per-bar counts                         |
| ------------------ | ---------- | ------------- | -------------------------------------------- |
| eat all the clocks | 4/4 at 120 | 120           | 2: 17, 3: 1, 4: 61                           |
| peaceful dreams    | 4/4 at 145 | 143           | 2: 11, 3: 3, 4: 131, 7: 1, 8: 2              |
| letter lands       | 4/4 at 132 | 130           | 2: 8, 3: 1, 4: 63                            |
| interbellum        | 4/4 at 115 | 115           | 1: 1, 2: 10, 3: 1, 4: 56, 6: 1               |
| mop heart          | 3/4 at 224 | 231           | 1: 1, 2: 22, 3: 32, 4: 29, 5: 10, 6: 9, 8: 2 |

## Rule 1: adjacent half bars are joined

Where the modal count is even and two bars in a row each hold half of
it, the line between them is dropped. On eat all the clocks the first
fifteen bars are two-beat bars of 1.0 s where the rest are four-beat
bars of 2.0 s. Study 41 found half bars cost nothing in chord roots,
and we believe it; the cost is in the chart, which draws every bar the
same, so fifteen half bars stand as fifteen bars of 4/4 and the bar
count is off by seven. A half bar with no partner stays as read.

**Ask A.** On the ten modern songs (and the 36 guitar drafts if cheap):
does joining change any draft's grade, and how many bars does it remove
per song against the declared bar count? Is there a case where two
adjacent half-count bars are really two bars (a 2/4 passage)?

## Rule 2: an unsteady reading is not used

If fewer than 60% of the bars (after joining) hold the modal count, the
draft keeps the declared grid. mop heart is the case: 30% at the modal
count, bars of 0.54 to 1.60 s, and a draft whose derived tempo was 167.
The four good songs sit at 0.78 to 0.96.

**Ask B.** The steady share for each of your ten songs and the guitar
set, against the draft's grade on the tracker's bars. Does a threshold
separate the bad drafts (the three on SS2-107-Ab among them) from the
good, and where? Is 0.6 defensible, or does the share not predict
anything on your corpus?

**Ask C.** mop heart itself: is a fast 3/4 a known weakness of small0,
and does final0 read it? If the big checkpoint reads what the small one
cannot, say how you would tell the two cases apart from the small one's
output alone.

## The comparison you offered

Our port against the package on real audio: the five slugs above are on
the dev stage (account mmkk, project badverbs), and the stored beats are
in `song.beats_json`. Tell us the form you want them in, or name songs
from your ten that the dev stage holds, and we will send the beats and
downbeats as JSON in a reply file here.

## Fence

$1 unless Ask C needs drafts; say before spending more.

## Bench reply (2026-11-11, stem-bench Study 44, $0)

Measured, as Study 44 (stem-bench docs/BRIEF-STUDY44.md,
results/study44.json; your `trackerBarGrid.ts` and `beatThisGrid.ts`
ported verbatim and pinned to your thirteen tests). One thing first: all
five of your dev recordings are already in the bench's Study 36 corpus
with package readings committed, so the comparison you offered is half
done, below.

**Ask A, joining.** Over the 261-song census (declared tempo and meter
from the artist), joining moves the tracker's bar count toward the
declared count on 73 songs and away on 61; among the 180 songs the
tracker reads at the declared level it is 44 to 36, mean count error 8.7 %
→ 6.1 %. A modest net gain, not a clear one. Your five: eat all the
clocks 80 → 72 bars (declared 74), interbellum 70 → 66 (65), but letter
lands 73 → 69 (78) and peaceful dreams 149 → 144 (155) were already
under the declared count as read, so by count those joined pairs were
real bars. The one clear win is gravity (6/8 at 48): read as 49 bars of
three and 54 of six, joining turns it into 94 bars against 94 declared
and lifts its share from 0.46 to 0.84; without joining, a good Study 41
draft fails your Rule 2. No GuitarSet take has a join. Whether joining
changes a draft's grade needs drafts on the joined grid; on the ten
Woodward songs that is four drafts (same-boat, goodbye-to-spring,
im-letting-go, gravity), about $0.60, written down in the brief as Arm
A2 and not run (Kevin's approval governs spend). "Really two bars":
the 61 census songs moved away are listed in results/study44.json; 24
are one or two joins, the rest are long half-bar stretches (SpaceCamp
30 joins) where the declared count says the halves were bars. Bench
reading: keep joining; its failure (two real bars drawn as one) is
cheaper than its success (a 6/8 song kept on the tracker's bars).

**Ask B, the steady share.** It enriches for a wrong bar and does not
separate. Census, small0, 27 of 261 readings have the bar wrong at every
fold: your rule (share after joining < 0.6) removes 35, of which 13 are
wrong and 22 are right at some fold; by meter, 19 of 223 in 4/4 and 16
of 37 in 6/8. The 14 wrong readings it keeps have shares 0.60 to 1.00.
Among the 22 drafts the bench has on small0 bars (Study 41's ten, Study
43's twelve), the rule removes two sound ones (my-favorite-regret, share
0.54, draft 42/42; the guitar take 01_SS2-88-F, 0.35, 14/14) and misses
the one confidently-wrong (04_SS2-107-Ab, share 0.93). Two other
measures swept (a fold-tolerant share counting bars at the modal count or
its double or half; the inter-beat coefficient of variation) do no
better at any threshold. Study 38's 68 madmom drafts all have share 1.0
(the DBN admits no other bar) and 28 are confidently-wrong, so the share
says nothing on a DBN tracker. Is 0.6 defensible? Not as a predictor of
a wrong bar (it removes more right readings than wrong). The registered
criterion (catch half the wrong bars at least cost) lands on 0.7, which
the bench reports and does not like: 57 removed, 40 right. Labelled
judgment: the rule's real job is to keep a reading like mop heart (0.30)
off the chart, and **0.4** does that at the least cost: 12 census
readings removed (5 wrong, 7 right), one draft (01_SS2-88-F, which
drafted 14/14 anyway), both good 6/8 drafts kept.

**Ask C, mop heart.** Not a small0 weakness. final0 fails your rule too
(share 0.47, the same beat at 231, modal bar 6 instead of 3); both raw
checkpoints hear the beat and lose the bar. final0 + DBN and madmom read
a steady 3/4 at 111 (70 bars of three, share 1.0): bars twice the
declared, a fold of two, so your declared 224 is the beat the raw
trackers hear and the DBN's bar is the dotted one. The other 3/4 in the
program, the waltz at 141.6, stands under small0 (0.62, narrowly) and
final0 (0.89); the census's one 3/4 (The Maze, 50) is 0.88; its 17 songs
at 180 bpm or faster have median share 0.88 with two under 0.6. Fast is
not the problem. Telling the two cases apart from small0's output
alone: the fold-tolerant share does it on this corpus (mop heart 0.39,
every good Woodward and MMKK reading ≥ 0.65); the beat CV does not
(mop heart 0.28; two good drafts sit at 0.32 and 0.34). Your own share
after joining separates too (0.30 against ≥ 0.54), which is the case
for 0.4.

**The comparison.** Your beats-per-bar table equals the bench's package
readings count for count on all five songs (eat all the clocks 2: 17,
3: 1, 4: 61 through mop heart 1: 1, 2: 22, 3: 32, 4: 29, 5: 10, 6: 9,
8: 2). For the beat-level F-measure, put the stored `beats_json` of the
five in `docs/bench-reply-beats-2026-11-11.json` as
`{ "<slug>": { "beats": [seconds], "downbeats": [seconds], "duration": s } }`
and the bench will score them against the package at 70 ms, $0.
