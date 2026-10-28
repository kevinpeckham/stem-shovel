import { extractFeatures } from "#lib/audio/analysis.js";
import modelSpec from "./basic-pitch/model.json";
import modelWeights from "./basic-pitch/weights.json";
import type { Note } from "#lib/audio/chords.js";
import {
	appendSongNotes,
	claimSongNotes,
	finishSongNotes,
	releaseSongNotes,
	songForNotes,
} from "#lib/server/data.js";
import { mixKeyOf } from "#lib/server/mix.js";
import { downloadToFile } from "#lib/server/effect/blobIo.js";
import type { BlobError, DbError, FfmpegError } from "#lib/server/effect/errors.js";
import { requireFfmpeg, runFfmpeg } from "#lib/server/effect/ffmpeg.js";
import { tempDir } from "#lib/server/effect/resources.js";
import { runJob } from "#lib/server/effect/runJob.js";
import { Db, type Services } from "#lib/server/effect/services.js";
import { TranscriberError } from "#lib/server/effect/transcriptionErrors.js";
import { JobTuning } from "#lib/server/effect/tuning.js";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Transcribes a song's tonal stems to notes on the server with Basic Pitch
 * (TensorFlow.js, CPU backend, about real time, in a child process), so the chart draft never
 * waits on the browser. Runs in the background after renditions, and from
 * the song page as a backstop, in SEGMENT-second pieces appended to the
 * song row, stopping after BUDGET_MS so a function lifetime is never
 * exceeded; the next trigger carries on from `notesDoneSeconds`. Skipped
 * for songs (or projects) marked "no AI".
 *
 * An Effect program (docs/effect-adoption.md, Phase 2) behind the Promise
 * export: the `notesStartedAt` lock is a scoped resource released on any
 * failure or interruption, the temp dir is scoped, Blob reads retry a
 * transient failure, the tonalness decodes run two at a time, and every
 * ffmpeg and the transcriber child run under `JobTuning`'s time limit with
 * the child killed when it is reached.
 */
const SEGMENT = 60;
const BUDGET_MS = 200_000;
const MODEL_RATE = 22050;
/** Decodes in flight at once for the tonalness pass (each a 30 s PCM file and an ffmpeg). */
const DECODES = 2;

type NotesError = BlobError | DbError | FfmpegError | TranscriberError | Cause.TimeoutError;

/**
 * The model runs in a child process, like ffmpeg: TensorFlow.js on the CPU
 * is a minute of solid compute per minute of audio, and in the server's own
 * event loop that would stall every other request on the instance. The
 * child gets the packages by absolute URL (resolved here) and the model from
 * two files written into the job's temp dir from copies bundled into this
 * module (src/lib/server/basic-pitch: the model JSON and its weights as
 * base64, about 1 MB, the same files as static/basic-pitch): fetching them
 * over HTTP from inside the function is answered by the firewall's bot
 * challenge (a 429 on 2026-09-19), and the adapter traces from the
 * filesystem root, so a `process.cwd()` path never resolves at build time
 * (docs/environment.md).
 */
/** The model files, once per job dir (the child reads them from disk). */
async function modelFiles(dir: string): Promise<{ json: string; weights: string }> {
	const json = join(dir, "model.json");
	const weights = join(dir, "weights.bin");
	if (!existsSync(json)) {
		await writeFile(json, JSON.stringify(modelSpec));
		await writeFile(weights, Buffer.from(modelWeights.base64, "base64"));
	}
	return { json, weights };
}
const CHILD_SCRIPT = `
const [tfUrl, bpUrl, modelJson, modelWeights, inFile] = process.argv.slice(1);
const tf = await import(tfUrl);
await tf.setBackend("cpu");
await tf.ready();
const { BasicPitch, noteFramesToTime, outputToNotesPoly } = await import(bpUrl);
const { readFileSync } = await import("node:fs");
const raw = readFileSync(inFile);
const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
// The model from disk, not over HTTP (the firewall challenges requests from inside the function).
const spec = JSON.parse(readFileSync(modelJson, "utf8"));
const weights = readFileSync(modelWeights);
const artifacts = {
	modelTopology: spec.modelTopology,
	weightSpecs: spec.weightsManifest.flatMap((g) => g.weights),
	weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
	format: spec.format, generatedBy: spec.generatedBy, convertedBy: spec.convertedBy,
};
const model = new BasicPitch(tf.loadGraphModel(tf.io.fromMemory(artifacts)));
const frames = [], onsets = [];
await model.evaluateModel(audio, (f, o) => { frames.push(...f); onsets.push(...o); }, () => {});
// No frames (a segment too short to evaluate): no notes, where outputToNotesPoly would throw.
if (frames.length === 0) { await new Promise((r) => process.stdout.write("[]", r)); process.exit(0); }
const notes = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.5, 0.3, 11, true, 3000, 40, true, 11));
process.stdout.write(JSON.stringify(notes.map((e) => [e.startTimeSeconds, e.durationSeconds, e.pitchMidi, e.amplitude])));
`;

const STDERR_TAIL = 2048;

/**
 * The transcriber child: Node running CHILD_SCRIPT, its stdout the notes as
 * JSON. Not ffmpeg, so not the `Ffmpeg` service, but held the same way:
 * under `JobTuning.ffmpegTimeout`, and killed when interrupted.
 */
function runTranscriber(
	args: string[],
): Effect.Effect<string, TranscriberError | Cause.TimeoutError> {
	return Effect.gen(function* () {
		const { ffmpegTimeout } = yield* JobTuning;
		return yield* Effect.callback<string, TranscriberError>((resume) => {
			const child = execFile(
				process.execPath,
				args,
				{ maxBuffer: 64 * 1024 * 1024 },
				(error, stdout, stderr) => {
					if (!error) return resume(Effect.succeed(stdout));
					resume(
						Effect.fail(
							new TranscriberError({
								code: typeof error.code === "number" ? error.code : null,
								signal: error.signal ?? null,
								stderr: (stderr || error.message).slice(-STDERR_TAIL),
							}),
						),
					);
				},
			);
			return Effect.sync(() => {
				child.kill();
			});
		}).pipe(Effect.timeout(ffmpegTimeout));
	}).pipe(Effect.withSpan("notes.transcriber"));
}

/** Transcribes one f32le mono 22050 Hz file in a child process; seconds are relative to the file. */
function transcribeFile(file: string) {
	return Effect.gen(function* () {
		const model = yield* Effect.promise(() => modelFiles(dirname(file)));
		const stdout = yield* runTranscriber([
			"--input-type=module",
			"-e",
			CHILD_SCRIPT,
			import.meta.resolve("@tensorflow/tfjs"),
			import.meta.resolve("@spotify/basic-pitch"),
			model.json,
			model.weights,
			file,
		]);
		const rows = yield* Effect.try({
			try: () => JSON.parse(stdout) as [number, number, number, number][],
			catch: () =>
				new TranscriberError({ code: 0, stderr: `unreadable output: ${stdout.slice(0, 200)}` }),
		});
		return rows.map(([start, duration, pitch, amplitude]): Note => ({
			start,
			end: start + duration,
			pitch,
			amplitude,
		}));
	});
}

/** PCM float32 mono of `file` from `start` for `seconds` at `rate`. */
function decode(file: string, start: number, seconds: number, rate: number) {
	const out = `${file}.${rate}.${Math.round(start)}.raw`;
	return runFfmpeg(
		[
			"-y",
			"-loglevel",
			"error",
			"-ss",
			String(start),
			"-t",
			String(seconds),
			"-i",
			file,
			"-ac",
			"1",
			"-ar",
			String(rate),
			"-f",
			"f32le",
			out,
		],
		{ span: "notes.decode" },
	).pipe(
		Effect.andThen(Effect.promise(() => readFile(out))),
		Effect.map((raw) => new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)),
	);
}

const asBuffer = (data: Float32Array, sampleRate: number) =>
	({
		sampleRate,
		length: data.length,
		numberOfChannels: 1,
		getChannelData: () => data,
	}) as unknown as AudioBuffer;

type NotesSong = NonNullable<Awaited<ReturnType<typeof songForNotes>>>;

/** The stems a run reads: none when the song is marked "no AI" or a rendition is still coming. */
function readyStems(song: NotesSong) {
	if (song.noAi || song.project.noAi) return [];
	const stems = song.stems.filter((s) => s.status === "ready" && s.url);
	return stems.some((s) => s.playbackStatus === "pending") ? [] : stems;
}

/** What a run would do for this song, or null when there is nothing to do (no AI, nothing ready, already complete). */
function planOf(song: NotesSong | undefined) {
	if (!song) return null;
	const stems = readyStems(song);
	if (stems.length === 0) return null;
	const key = mixKeyOf(stems);
	const duration = Math.max(...stems.map((s) => s.durationSeconds ?? 0));
	if (duration <= 0) return null;
	if (song.notesKey === key && song.notesDoneSeconds >= duration) return null;
	// New stems since the last run (the key is written at the claim): start over.
	const fresh = song.notesKey !== key;
	return { stems, key, duration, fresh, from: fresh ? 0 : song.notesDoneSeconds };
}

/** Each stem's rendition (or its source when it has none) into `dir`, one at a time. */
function downloadStems(stems: NonNullable<ReturnType<typeof planOf>>["stems"], dir: string) {
	return Effect.forEach(stems, (s, i) => {
		const file = join(dir, `stem-${i}`);
		const url = s.playbackStatus === "ready" && s.playbackUrl ? s.playbackUrl : s.url;
		return Effect.as(downloadToFile(url, file), file);
	});
}

/** Which stems carry harmony: the same tonalness the browser uses, on 30 s, relative to the most tonal. */
function tonalWeights(files: string[]) {
	return Effect.forEach(
		files,
		(f) =>
			Effect.map(
				decode(f, 0, 30, 32000),
				(data) => extractFeatures(asBuffer(data, 32000), 30).tonal,
			),
		{ concurrency: DECODES },
	).pipe(
		Effect.map((tonal) => {
			const top = Math.max(...tonal, 1e-9);
			return tonal.map((t) => t / top);
		}),
	);
}

/** The notes of `seconds` from `start`: the tonal stems mixed by weight, normalized, transcribed. */
function transcribeSegment(
	files: string[],
	weights: number[],
	dir: string,
	start: number,
	seconds: number,
) {
	return Effect.gen(function* () {
		let mono: Float32Array | null = null;
		for (const [i, f] of files.entries()) {
			if (weights[i] < 0.35) continue;
			const data = yield* decode(f, start, seconds, MODEL_RATE);
			mono ??= new Float32Array(data.length);
			for (let k = 0; k < Math.min(data.length, mono.length); k++) mono[k] += data[k] * weights[i];
		}
		if (!mono) return [];
		let peak = 0;
		for (let k = 0; k < mono.length; k++) peak = Math.max(peak, Math.abs(mono[k]));
		if (peak > 0) for (let k = 0; k < mono.length; k++) mono[k] /= peak;
		const segmentFile = join(dir, `segment-${Math.round(start)}.raw`);
		const pcm = Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength);
		yield* Effect.promise(() => writeFile(segmentFile, pcm));
		const notes = yield* transcribeFile(segmentFile);
		return notes.map((n): Note => ({ ...n, start: start + n.start, end: start + n.end }));
	});
}

/**
 * One run of the transcription (see the module comment). On success the
 * lock is cleared by `finishSongNotes`, or by `releaseSongNotes` when the
 * budget ran out first (the next trigger continues from `done`); on a
 * failure or interruption the scope releases it.
 */
export function ensureSongNotesEffect(songId: string): Effect.Effect<void, NotesError, Services> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const plan = planOf(yield* db.call("notes:read", () => songForNotes(songId)));
		if (!plan) return;
		const claimed = yield* Effect.acquireRelease(
			db.call("notes:claim", () => claimSongNotes(songId, plan.key, plan.fresh)),
			(claimed, exit) =>
				claimed && Exit.isFailure(exit)
					? Effect.ignore(db.call("notes:release", () => releaseSongNotes(songId)))
					: Effect.void,
		);
		if (!claimed) return;
		yield* requireFfmpeg;
		const started = Date.now();
		const dir = yield* tempDir("notes-");
		const files = yield* downloadStems(plan.stems, dir);
		const weights = yield* tonalWeights(files);
		let done = plan.from;
		while (done < plan.duration && Date.now() - started < BUDGET_MS) {
			const seconds = Math.min(SEGMENT, plan.duration - done);
			const notes = yield* transcribeSegment(files, weights, dir, done, seconds);
			done += seconds;
			const through = done;
			yield* db.call("notes:append", () => appendSongNotes(songId, notes, through));
		}
		if (done >= plan.duration) yield* db.call("notes:finish", () => finishSongNotes(songId));
		else yield* db.call("notes:release", () => releaseSongNotes(songId));
	}).pipe(Effect.scoped, Effect.withSpan("notes.ensure", { attributes: { songId } }));
}

export function ensureSongNotes(songId: string): Promise<void> {
	return runJob("job.notes", ensureSongNotesEffect(songId));
}

/**
 * Never called. The child process above resolves tfjs and Basic Pitch by
 * name, which Vercel's file tracer cannot see; these literal imports make
 * it pack both with the jobs function (they were missing on Vercel until
 * 2026-09-19, so notes were never transcribed there).
 */
export async function traceTranscriptionDeps(): Promise<void> {
	await import("@tensorflow/tfjs");
	await import("@spotify/basic-pitch");
}
