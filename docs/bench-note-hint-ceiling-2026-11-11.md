# Bench note: what the ChordMini hint is worth, quality by quality (2026-11-11)

From stem-bench Study 46 (docs/BRIEF-STUDY46.md, results/study46.json),
$0. A measurement of the hint the draft prompt receives, over all 360
GuitarSet excerpts (5,280 bars, five styles, comping and single-line
solos), scored per bar against the lead sheet.

## The numbers

| input                               | root right | quality family right | hint absent (N.C.) |
| ----------------------------------- | ---------- | -------------------- | ------------------ |
| comping, Rock and Singer-Songwriter | 95 %       | 83 %                 | under 1 %          |
| comping, Bossa Nova / Jazz / Funk   | 66 %       | 56 %                 | 8 %                |
| single melodic line (solo)          | 11 %       | 21 %                 | 56 %               |

By the sheet's quality, on comping: major right 77 %, minor 63 %,
dominant seventh 41 % (heard as a plain major more often than as a
seventh), diminished or half-diminished 2 % (4 of 240 bars over the whole
set; it hears a minor or a major). The root of a dominant bar is right
94 % of the time on rock-shaped comping; the root of a diminished bar
only 48 %.

## What it means for the prompt

The hint sentence the prompt carries treats the hint as one thing. It is
two: a root that deserves its trust on strummed material (and most of it
on jazz-shaped comping), and a quality that is reliable for major and
minor and unreliable for sevenths and diminished chords. The bench's
registered rule fires for minor, dominant and diminished over all
excerpts; on comping alone, which is the shape of what the app receives,
minor clears the line and dominant and diminished do not.

Recommendation: the prompt should tell the model the hint's root is
reliable and its quality is advisory, so that the sevenths and the
half-diminished the quality clause (v0.262.1) now asks for are decided
by the audio and the key, not overruled by a hint that cannot hear them.
The bench has not written the sentence; that is a study of its own, and
it would be paired against v0.262.1 on the same bars.

On a single melodic line the hint is absent more often than present.
If a user ever uploads a lead line alone, the hint is not evidence and
the model should not be asked to follow it; the bench has not measured
how often that happens.

## Follow-up: the sentence was tested, and it does nothing (2026-11-12)

stem-bench Study 47 ($1.46) replaced the bench's hint sentence with the
finding above in so many words ("Its root is reliable: keep it unless the
notes plainly contradict it. Its quality is advisory: it hears major and
minor well, hears a seventh as a plain triad more often than not, and
almost never hears a diminished or half-diminished chord, so decide the
quality from the notes and the key") and drafted the same 22 items on the
same bars against the quality-clause drafts. Seventeen of 22 drafts kept the same counts (corrected 2026-11-13 from nineteen: four moved by one position and one by two); the half-diminished was spelled in the same seven of
twelve; no class moved on the modern songs. Reported without a
recommendation. The bench's reading: the quality the drafts lose on the
dense sheet is not lost by deferring to the hint, so no sentence about
the hint recovers it; what the model lacks there is in Basic Pitch's
notes of a strummed chord. The recommendation above to describe the hint
honestly stands on Study 46's measurement, as a matter of not overstating
it; do not expect it to change the charts.
