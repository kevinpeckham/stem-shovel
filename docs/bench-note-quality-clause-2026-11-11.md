# Bench note: the prompt's rock clause and chord quality (2026-11-11)

From stem-bench Study 45 (docs/BRIEF-STUDY45.md, results/study45.json,
results/study45-attribution.json), $1.46. Not an answer to a brief; a
finding about `draftChartWithAi`'s system prompt that the app should
weigh.

## What was found

Study 43 left the dense GuitarSet sheet (a ii–V–I with a half-diminished
and two dominant sevenths) with every root right on Beat This small0's
bars and the qualities wrong: the half-diminished written as a minor or
a dominant, dominants as triads, two thin takes as power chords
throughout. Study 45 asked where the quality goes and whether one clause
of the system prompt is in the way.

**Where it goes.** Of the 40 quality positions lost on that sheet at the
bar grid, 25 are bars where the ChordMini hint's quality was already
wrong (the model followed it on 14, wrote a third family on 11), 13 are
power chords on one take, 2 are the model losing a right hint. ChordMini's
vocabulary has no half-diminished, so every such bar arrives with a wrong
or empty hint. That is the larger gap and it is in the hint, not the
prompt.

**The clause.** Step 0 of the system prompt reads: "think like a rock
musician reading a chart — simple, plausible progressions in the key over
exotic spellings; power chords (5) and sus chords are common here." The
bench replaced it, and nothing else (pinned by test), with:

> name the quality the notes support — a seventh (7, m7, maj7, m7b5) when
> the seventh sounds, a plain triad when it does not, and a power chord
> (5) only when neither third sounds; prefer plausible progressions in
> the key over exotic spellings.

Paired against production on the same bars: on ten guitar takes,
qualities up on 6 and down on 1, roots down on none, the one confidently
wrong draft on your tracker's bars turned good with its half-diminished
named; the half-diminished spelled in 7 of 12 drafts where production
spelled it in 3 of 10; good drafts 3 of 10 → 5 of 12. On the ten Woodward
songs: no class changed, eight good before and after, one root count
50 → 48, one quality count up by one. The rock clause was not carrying
the rock charts. What the new clause did not fix: power chords on thin
takes (5 drafts of 12 carry one, from 3), despite its "only when neither
third sounds".

**By the registered rule** (qualities up on six AND two more good drafts)
the result is reported without a recommendation: good rose by one. The
bench's labeled judgment is that the evidence favours the clause, since
it lifted six takes, lowered one, and cost the modern songs nothing. Your
call; the paired cells are in results/study45.json.

**One more observation, no causal claim.** The two guitar takes whose
production drafts stopped at the gateway's content filter in Study 43
drafted normally under the new clause, and none of 22 drafts was stopped.
The two runs differ in that clause alone. Two cases.

## If you take it

The clause is the only change; the hint sentence, the JSON contract and
the examples branch are untouched. If the band's charts lean on power
chords, the examples the prompt receives carry that style already (the
bench's drafts ran with "No example charts yet"). The next gap on
acoustic material is the hint's missing half-diminished, which is a
ChordMini vocabulary matter the bench can measure on request.


## Correction (2026-11-11, same day)

Above, the bench wrote that ChordMini's vocabulary has no half-diminished.
Wrong: its 170 labels include hdim7 for every root, and the bench's
mapping writes it as "dim", the same quality family as m7b5. The hint was
wrong on those bars because the model did not hear a half-diminished
there (it voted E or C#), not because it could not name one. The
attribution numbers stand; the cause is the model's accuracy on that
quality, not its vocabulary. The bench is measuring that accuracy across
all of GuitarSet (stem-bench Study 46) and will report.
