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
