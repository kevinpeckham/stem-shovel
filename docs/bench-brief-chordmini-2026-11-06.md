# Brief for the stem-bench agent: ChordMini is the app's chord reader (2026-11-06)

From the stem-shovel agent, via Kevin. The app now reads a song's chords from its mix with ChordMini on the server, exactly the Study 17 pipeline, ported to TypeScript. Please register Study 19 to gate the port and keep the bench's numbers as the app's.

## What the app runs (src/lib/server/chords.ts, src/lib/utils/chordmini*.ts)

The same contract as `scripts/study10/nchord.py`:

1. The original mix MP3 decoded with `ffmpeg -ac 1 -ar 22050 -f f32le` (arithmetic mean of the channels, as your decode).
2. librosa 0.11's `cqt(hop_length=2048, fmin=32.70319566257483, n_bins=144, bins_per_octave=24, norm=1, sparsity=0.01, window="hann", scale=True, pad_mode="constant")`, features = `log(|C| + 1e-6)`, shape [T, 144]. Not librosa itself: the CQT is baked into a plan (`src/lib/server/chordmini/cqt-plan.json`: one early 2:1 decimation, six octaves of sparse complex kernels over an STFT of 512) and evaluated in TypeScript. The resampler is a Kaiser FIR (255 taps, cutoff 0.48 Nyquist, beta 12, ×√2) in place of soxr.
3. `chordnet.onnx` from `musetric/chordmini-onnx` (SHA-256 `1faee8e1…`), windows of 108 frames in groups of 16, zero-padded.
4. Per window, logits summed over a 9-frame box (radius 4, truncated at the window's edges), argmax per frame.
5. Run-length segments stored on the song; on the page, a chord per bar by majority vote over frames `round(barStart/frameSec) .. round(nextStart/frameSec)` (at least one frame), labels mapped through your `chordmini-vocab.json`.

The port agrees with the Python reference on the three MMKK mixes (the app's own parity run, 2026-11-06, before Study 19 confirmed it on all four):

| song               | seconds | frames TS / Py | feature max diff | feature mean diff | chord frames agree | CQT    | inference |
| ------------------ | ------- | -------------- | ---------------- | ----------------- | ------------------ | ------ | --------- |
| letter-lands       | 141.3   | 1522 / 1522    | 0.0207           | 0.00000           | 100.00 %           | 0.96 s | 4.80 s    |
| eat-all-the-clocks | 147.5   | 1588 / 1588    | 0.0501           | 0.00001           | 100.00 %           | 0.96 s | 5.33 s    |
| peaceful-dreams    | 256.7   | 2764 / 2764    | 0.0047           | 0.00000           | 100.00 %           | 1.59 s | 5.59 s    |

Inference time includes decoding the model and starting the child. **Study 19 (2026-11-06) verdict**: 100.000 % on all four public mixes (7,102 frames), per-bar 59/76 and 53/86 exactly; one grade-neutral difference, an exact 5-to-5 frame tie on two bars of letter-lands that numpy's argmax breaks toward the lower vocab index and the app's vote toward the label seen first (FINDINGS.md).

## Study 19: gate the port

- **Parity**: run the app's reader on the Study 17 mixes through the app's own code (`src/lib/utils/chordminiCqt.ts` + `src/lib/server/chordmini/infer.ts` are importable from a bun script with the repo checked out; the plan and model JSON are in the repo) and compare the frame indices with `nchord.py`'s. Register the agreement rate; ≥ 99.5 % is the pass line.
- **Per-bar score**: the app's `chordminiBarChords` over the same bar grid as Study 17's vote, graded as G1 (root-level). The target is Study 17's 59/76 on the registered set and 53/86 on eat-all-the-clocks; a drop of more than one bar is a port defect, not a model result.
- **Keep the reconcile rule**: the app never runs the AI check on the model's chords (Study 17 G4: 16 right bars broken). If a later study finds a check that helps, say so with the numbers.

## What to tell us

The agreement rate per song, the per-bar score per song, and any frame-alignment or label-mapping difference you find. If the port's indices differ from the reference on a song, the CQT features at the first differing frame (max abs diff) say whether it is the resampler or the kernel.
