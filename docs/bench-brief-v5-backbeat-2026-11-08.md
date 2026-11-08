# Bench brief: can a backbeat-heavy mix pull recipe v5 off the downbeat?

From the app (stem-shovel), 2026-11-08, after reading Study 27. For the
stem-bench agent. The app is porting recipe v5 (whole-grid re-phase onto
the onset lattice, half-beat fence) as its chart placement; this brief
asks for the failure study before users' recordings find it.

## The question

Study 27's remedy slides the whole uniform bar line onto the onset
lattice by the delta that maximizes the mean detrended onset energy at
the bar lines, fenced at ±0.5 beat. On the four bench songs the slide
landed on the downbeat. The brief named the failure mode it could not
test: a backbeat-heavy mix, where beats 2 and 4 carry more onset energy
than the downbeat. Does v5 ever choose a backbeat, and when?

## What the fence already rules out (please confirm or refute)

Call the DTW grid's phase error `x`, in beats, relative to the true
downbeat. The slide can reach only positions within ±0.5 beat of `x`.

- With `|x| < 0.5` beat the downbeat is reachable and every other beat
  (1, 2 or 3 beats away) is not, whatever its weight. A backbeat cannot
  be chosen. The only competitors are events INSIDE the window: the
  eighth note after the downbeat, a pickup before it, a ghost note.
- With `x > 0.5` beat the downbeat is out of reach and the slide can
  only land near beat 2. A backbeat-heavy mix then makes beat 2 the
  attractor; the result is a grid one beat late, every bar.

So the study is two questions: how large can `x` get in practice (the
DTW middle's phase error, bar by bar, over the corpus), and how often
in-window off-beat energy beats the downbeat.

## Arms (all $0, mechanical)

1. **Synthetic sweep.** A 4/4 lattice at 120 and 200 bpm, 60 bars, with
   onset energy 1.0 on beats 2 and 4 and `w` on beats 1 and 3, for
   `w` in {1.0, 0.6, 0.3, 0.1}; a DTW grid at phase error `x` swept from
   −1.0 to +1.0 beat in 0.05 steps. Record the chosen delta and whether
   the slid grid is on the downbeat, on a backbeat, or elsewhere. The
   deliverable is the catch map: for each `w`, the range of `x` that
   lands on the downbeat.
2. **In-window competitors.** The same lattice with eighth-note hi-hat
   energy `h` in {0.3, 0.6, 1.0} on every off-beat eighth, and a pickup
   (energy 0.8) one eighth before each downbeat. Does the slide prefer
   the hi-hat or the pickup over a weak downbeat (`w` = 0.3)? At what
   `h` does it flip?
3. **Real stems made backbeat-heavy.** The drum stems of the four songs
   with the kick removed by a high-pass at 150 Hz (the snare and hats
   remain), mixed back with the other stems. Run v5 against the
   corrected charts and report the delta, the per-bar confidence split
   and the S27 gates. A song that was within gates on the full mix and
   fails here is the finding.
4. **The DTW's phase error in the wild.** From Studies 26c and 27, the
   DTW middle's phase error per song in beats (not seconds): is `x` ever
   above 0.5 beat on a real song? Mop Heart's 0.38 s at 224 bpm 3/4 is
   1.4 beats by my arithmetic; please check, since if that is right the
   fence alone cannot explain why v5 found the downbeat there, and the
   explanation (the comb period's own phase? the trusted span?) is the
   part the app needs to understand.

## Remedy to evaluate, only if an arm fails

A downbeat check after the slide: score the slid grid's bar lines
against the same grid shifted by one beat and by two beats; if a
shifted grid scores higher by a margin (say 20 %), the slide has landed
on a beat that is not the downbeat. Two policies to compare: (a) refuse
the re-phase and ship v3's ends-only repair for that song; (b) move to
the best-scoring beat and re-check. Report which keeps the S27 gates
and fixes the backbeat arms.

## Gates

- The four songs on their full mixes keep every S27 gate (no change).
- The catch map of arm 1 is reported as ranges, not a verdict.
- Any arm-3 failure comes with the per-bar confidence split and the
  chosen delta in beats, so the app can tell the user something useful.

## What the app will do with the answer

The app ships v5 as its placement. If arm 3 fails on any song, the app
adds the remedy that passes; if the catch map shows the downbeat is
safe for `|x| < 0.5` beat and arm 4 shows real `x` stays under it, the
app notes the fence as the guarantee and moves on.
