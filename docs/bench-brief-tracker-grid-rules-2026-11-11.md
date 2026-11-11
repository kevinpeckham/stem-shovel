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
