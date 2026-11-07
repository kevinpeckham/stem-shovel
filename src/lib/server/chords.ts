import config from "./chordmini/config.json";
import plan from "./chordmini/cqt-plan.json";
import {
	claimSongChords,
	releaseSongChords,
	setSongChords,
	songForChords,
} from "#lib/server/data.js";
import { downloadToFile } from "#lib/server/effect/blobIo.js";
import type { BlobError, DbError, FfmpegError } from "#lib/server/effect/errors.js";
import { requireFfmpeg, runFfmpeg } from "#lib/server/effect/ffmpeg.js";
import { tempDir } from "#lib/server/effect/resources.js";
import { runJob } from "#lib/server/effect/runJob.js";
import { Db, type Services } from "#lib/server/effect/services.js";
import { TranscriberError } from "#lib/server/effect/transcriptionErrors.js";
import { JobTuning } from "#lib/server/effect/tuning.js";
import { chordminiFeatures } from "#lib/utils/chordminiCqt.js";
import { chordminiIndices } from "#lib/utils/chordminiSmooth.js";
import { chordminiRunsOf } from "#lib/utils/chordminiRunsOf.js";
import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";
import { harteToBarmark } from "barmark";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Reads a song's chords from its original mix with ChordMini on the server
 * (docs/audio-engine.md, "The chord model"; stem-bench Study 17: 59 of 76
 * bars on a real recording against the note path's 29): the mix decoded to
 * mono at 22050 Hz as the bench did (`ffmpeg -ac 1`, the arithmetic mean
 * the model was trained on), the librosa-equivalent log-CQT
 * (utils/chordminiCqt.ts, from the baked plan), the ONNX model in a child
 * process (chordmini/infer.ts: onnxruntime-web's wasm backend, so the
 * function's event loop is never held), the reference smoothing and argmax,
 * and the frames run-length encoded onto the song row with barmark's spelling
 * of each label (`harteToBarmark`). Runs after the mix renders and from the
 * song page as a backstop; a song (or project) marked "no AI" is skipped.
 */
const MODEL_RATE = 22050;
/** Frames per second of the model's features (hop 2048 at 22050 Hz). */
const FRAME_SEC = 2048 / MODEL_RATE;
/** The contract's name on the stored runs: the model's SHA-256 (chordmini/model.json) and the plan's, both pinned by the bench. */
export const CHORDMINI_VERSION = `1faee8e1-${createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 8)}`;

type ChordsError = BlobError | DbError | FfmpegError | TranscriberError | Cause.TimeoutError;

/** The mix decoded to float32 mono at the model's rate, as the bench decoded it. */
function decodeMix(file: string) {
	const out = `${file}.${MODEL_RATE}.raw`;
	return runFfmpeg(
		[
			"-y",
			"-loglevel",
			"error",
			"-i",
			file,
			"-ac",
			"1",
			"-ar",
			String(MODEL_RATE),
			"-f",
			"f32le",
			out,
		],
		{ span: "chords.decode" },
	).pipe(
		Effect.andThen(Effect.promise(() => readFile(out))),
		Effect.map((raw) => new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)),
	);
}

/** The model's logits for the features, from the child, under the job's time limit. */
function inferLogits(features: Float32Array, frames: number, dir: string) {
	return Effect.gen(function* () {
		const { ffmpegTimeout } = yield* JobTuning;
		return yield* Effect.tryPromise({
			// The model (23 MB as JSON) loads only when a chords job runs, never with the jobs function.
			try: async () =>
				(await import("./chordmini/infer.js")).chordminiLogits(features, frames, dir),
			catch: (e) =>
				new TranscriberError({ code: null, signal: null, stderr: String(e).slice(-2048) }),
		}).pipe(Effect.timeout(ffmpegTimeout));
	}).pipe(Effect.withSpan("chords.infer"));
}

/** The stored shape: runs of frames with barmark's spelling and the model's own label. */
function runsOf(indices: Int32Array, labels: string[], frames: number): ChordminiRuns {
	return {
		version: CHORDMINI_VERSION,
		frameSec: FRAME_SEC,
		frames,
		runs: chordminiRunsOf(indices, labels).map((r) => ({
			...r,
			// barmark spells the label: N (no chord) is "N.C.", X (unknown) is "?", and a label it cannot read is "?" too.
			chord: harteToBarmark(r.label) ?? "?",
		})),
	};
}

/** One run: the claim under `acquireRelease`, so a failure or an interruption releases it. */
export function ensureSongChordsEffect(songId: string): Effect.Effect<void, ChordsError, Services> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const song = yield* db.call("chords:read", () => songForChords(songId));
		if (!song || song.noAi || song.project.noAi) return;
		if (!song.mixUrl || !song.mixKey || song.chordsKey === song.mixKey) return;
		const key = song.mixKey;
		const url = song.mixUrl;
		const claimed = yield* Effect.acquireRelease(
			db.call("chords:claim", () => claimSongChords(songId)),
			(claimed, exit) =>
				claimed && Exit.isFailure(exit)
					? Effect.ignore(db.call("chords:release", () => releaseSongChords(songId)))
					: Effect.void,
		);
		if (!claimed) return;
		yield* requireFfmpeg;
		const dir = yield* tempDir("chords-");
		const file = join(dir, "mix");
		yield* downloadToFile(url, file);
		const samples = yield* decodeMix(file);
		const { frames, features } = chordminiFeatures(samples, plan);
		const logits = yield* inferLogits(features, frames, dir);
		const indices = chordminiIndices(logits, frames);
		const runs = runsOf(indices, config.chordVocab, frames);
		yield* db.call("chords:store", () => setSongChords(songId, key, runs));
	}).pipe(Effect.scoped, Effect.withSpan("chords.ensure", { attributes: { songId } }));
}

export function ensureSongChords(songId: string): Promise<void> {
	return runJob("job.chords", ensureSongChordsEffect(songId));
}
