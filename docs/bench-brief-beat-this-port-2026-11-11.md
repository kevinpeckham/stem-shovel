# Bench brief: deliver the Beat This export and port fixtures (2026-11-11)

From the stem-shovel session, after Studies 41 and 42. No study to run and
nothing to spend: this is a delivery, so the port can be verified here
without torch.

## Placement, decided

The tracker will run **in the jobs function, beside the chord model**, not
in the browser. Study 42's rule (S42-D1) points at the browser on speed
alone, and the speed holds either way; the reason is where its output is
used. The draft is built server-side (`src/lib/server/chartBuild.ts`) from
ChordMini's frames, which the job already computes from the same 22050 Hz
mono decode (`src/lib/server/chords.ts`), and the tracker's downbeats
become that build's bar lines. One decode, one child process pattern
(`src/lib/server/chordmini/infer.ts`), and no second copy of the audio in
the reader's tab. The stems scan in the browser keeps its own detector for
now. Say so if the bench sees a reason against.

## What to deliver, pushed to stem-shovel `dev`

1. **The model**, as `src/lib/server/beatThis/model.json`, in the shape
   ChordMini's has (`src/lib/server/chordmini/model.json`):
   `{ "sha256": "<hex of the .onnx bytes>", "bytes": <length>, "base64": "<the file>" }`
   for `beat_this-small0-static1500.onnx` (sha256 `d57ae630…`, 9,932,033
   bytes). Vite bundles JSON into the function; the adapter packs no file
   read from disk.

2. **Fixtures** under `tests/fixtures/beat-this/`, little-endian float32
   raw files with a `manifest.json` giving each file's shape and what made
   it. Synthetic audio only (nothing with rights):
   - `audio.f32`: about 40 s of a synthetic signal at 22050 Hz mono that
     the tracker reads sensibly (a click or drum-like pattern at a steady
     tempo in 4/4 with a marked downbeat, plus some pitched content), so
     it spans two 1500-frame windows.
   - `logmel.f32`: the package's `LogMelSpect` of that audio, frames × 128. This verifies our front end.
   - `chunk0.f32` and `chunk0-beat.f32`, `chunk0-downbeat.f32`: the first
     1500 × 128 window exactly as fed to the export, and the export's two
     logit rows for it. This verifies our session wiring.
   - `beat-logits.f32`, `downbeat-logits.f32`: the stitched full-length
     logits (keep_first, borders dropped). This verifies our chunking.
   - `expected.json`: the package's beats and downbeats in seconds for
     that audio, the tempo (60 / median inter-beat interval) and the
     beats-per-bar counts, as `nbeat.py` reports them. This verifies the
     postprocessor and the labels.
     Under a megabyte or two in all if it can be; trim the audio if not.

3. **A line in the manifest** naming the package version, the torch and
   torchaudio versions, and the export script's commit, so a later
   re-export can be told from this one.

## What we port meanwhile

From `scripts/study10/nbeat.py`: the log-mel front end (n_fft 1024, hop
441, Hann, power 1, frame-length normalization, 128 slaney mels 30 to
11000 Hz, log1p(1000·x)), `split_piece` and `aggregate_prediction` at
1500 / 6 / keep_first, the minimal postprocessor with
`deduplicate_peaks` and downbeats moved to the nearest beat, and Study
41's labels (modal beats per bar: 6 → 6/8 at tempo ÷ 3, 3 → 3/4, else
4/4). Two details we will take from torchaudio unless told otherwise:
`center=True` with reflect padding, and slaney mels with `norm=None`
(the package's `MelSpectrogram` default). Correct us if the package
differs on either.

## After the port

We will ask for the $0 comparison Study 42 offered: our beats and
downbeats against the package's on a few of the ten songs.

## Bench delivery (2026-11-11, from stem-bench Study 42)

**Placement.** No reason against the jobs function. The bench's rule
placed it by speed alone, as the brief says; one decode and one child
process beside ChordMini is the better architecture, and the speed
holds either way (ONNX Runtime at four threads matches torch, about one
second of model time per minute of audio). The scan's detector staying
in the browser is consistent with Study 40's advice (no 6/8 call).

**Delivered, pushed to dev with this note:**

1. `src/lib/server/beatThis/model.json`: `{sha256, bytes, base64}` of
   `beat_this-small0-static1500.onnx`, sha256
   `d57ae630f0daa290f558d076d963d2216b4c447d72695e691a79e3c792447124`,
   9,932,033 bytes (13.2 MB as JSON). Input `spectrogram` float32
   [1, 1500, 128]; outputs `beat`, `downbeat` float32 [1, 1500] logits.
2. `tests/fixtures/beat-this/`, 4.4 MB in all, little-endian float32:
   `audio.f32` (32 s, 2.8 MB; two 1500-frame windows need more than
   29.8 s, so the audio could not go under two megabytes), `logmel.f32`
   (1601 × 128), `chunk0.f32` (1500 × 128, the first window exactly as
   fed: six zero frames, then frames 0 to 1493), `chunk0-beat.f32` and
   `chunk0-downbeat.f32` (the export's logits for it),
   `beat-logits.f32` and `downbeat-logits.f32` (1601 each, stitched
   keep_first with the borders dropped), `expected.json` (the package's
   own `Audio2Beats(small0, dbn=False)` beats and downbeats in seconds,
   tempo 60 / median inter-beat interval, beats-per-bar counts, the
   modal count and the Study 41 label), and `manifest.json` with every
   shape, the front-end and chunking parameters, and the versions
   (beat_this 1.1.0, torch 2.15.0+cpu, torchaudio 2.11.1+cpu,
   onnxruntime 1.31.1; export script stem-bench
   scripts/export-study42.py at 4792e1f; fixture script
   scripts/deliver-study42-fixtures.py).
3. The synthetic audio is a drum-kit pattern at 110 bpm in 4/4 (kick on
   1 and 3 with the downbeat accented, snare on 2 and 4, hats on the
   eighths, a bass note alternating C and G on the downbeats, a quiet
   triad pad changing by the bar), chosen from six candidates as the one
   the package reads as a steady 4/4: 59 beats, 15 downbeats, every bar
   4 beats, tempo 111.1 (110 at the 20 ms frame grid), first downbeat at
   0.0. A click-only pattern was read as 200 bpm with broken bars, so
   do not simplify the fixture. The export's reading through the numpy
   postprocessor equals the package's on this audio
   (`exportMatchesPackage: true`).

**The two torchaudio details, confirmed from the package's module:**
`center=True` with `pad_mode="reflect"`, and slaney mels with
`norm=None` (filterbank 513 × 128). Two more worth matching: the window
is torch's default periodic Hann (`torch.hann_window(1024)`, first
samples 0, 9.42e-6, 3.76e-5), and `normalized="frame_length"` divides
the magnitude by sqrt(1024) = 32 before the mel projection and the
log1p(1000·x). One-sided spectrum, 513 bins.

**Verifying the port:** compare your log-mel of `audio.f32` with
`logmel.f32` (expect agreement to about 1e-4 after log1p; the FFT
libraries differ in the last bits), your first window with
`chunk0.f32` exactly, your session's logits on `chunk0.f32` with
`chunk0-beat.f32` and `chunk0-downbeat.f32` (expect 1e-4 or better),
your stitched logits with `beat-logits.f32` and `downbeat-logits.f32`,
and your beats and downbeats with `expected.json` to the frame (20 ms).
When the port runs on real audio, send the bench the slugs and it will
run the $0 comparison against the package on the ten songs.
