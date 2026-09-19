import { extractFeatures } from "$lib/audio/analysis";
import type { Note } from "$lib/audio/chords";
import { readBlob } from "$lib/server/blob";
import {
	appendSongNotes,
	claimSongNotes,
	finishSongNotes,
	releaseSongNotes,
	songForNotes,
} from "$lib/server/data";
import { mixKeyOf } from "$lib/server/mix";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

/**
 * Transcribes a song's tonal stems to notes on the server with Basic Pitch
 * (TensorFlow.js, CPU backend, about real time, in a child process), so the chart draft never
 * waits on the browser. Runs in the background after renditions, and from
 * the song page as a backstop, in SEGMENT-second pieces appended to the
 * song row, stopping after BUDGET_MS so a function lifetime is never
 * exceeded; the next trigger carries on from `notesDoneSeconds`. Skipped
 * for songs (or projects) marked "no AI".
 */
const run = promisify(execFile);
const SEGMENT = 60;
const BUDGET_MS = 200_000;
const MODEL_RATE = 22050;

/**
 * The model runs in a child process, like ffmpeg: TensorFlow.js on the CPU
 * is a minute of solid compute per minute of audio, and in the server's own
 * event loop that would stall every other request on the instance. The
 * child gets the packages by absolute URL (resolved here) and the model from
 * our own static files, fetched with Node's fetch under a named user agent:
 * tfjs's node-fetch client looks like a bot to Vercel's firewall (a 429
 * challenge on 2026-09-19, docs/environment.md).
 */
const CHILD_SCRIPT = `
const [tfUrl, bpUrl, modelUrl, inFile] = process.argv.slice(1);
const tf = await import(tfUrl);
await tf.setBackend("cpu");
await tf.ready();
const { BasicPitch, noteFramesToTime, outputToNotesPoly } = await import(bpUrl);
const { readFileSync } = await import("node:fs");
const raw = readFileSync(inFile);
const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
// Node's own fetch, named: tfjs's node-fetch client is challenged (429) by Vercel's bot protection.
const fetchModel = (u, init) => fetch(u, { ...init, headers: { ...(init && init.headers), "user-agent": "stem-shovel-jobs (+https://www.stemshovel.com)" } });
const model = new BasicPitch(tf.loadGraphModel(tf.io.http(modelUrl, { fetchFunc: fetchModel })));
const frames = [], onsets = [];
await model.evaluateModel(audio, (f, o) => { frames.push(...f); onsets.push(...o); }, () => {});
const notes = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.5, 0.3, 11, true, 3000, 40, true, 11));
process.stdout.write(JSON.stringify(notes.map((e) => [e.startTimeSeconds, e.durationSeconds, e.pitchMidi, e.amplitude])));
`;

/** Transcribes one f32le mono 22050 Hz file in a child process; seconds are relative to the file. */
async function transcribeFile(file: string, origin: string): Promise<Note[]> {
	const { stdout } = await run(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			CHILD_SCRIPT,
			import.meta.resolve("@tensorflow/tfjs"),
			import.meta.resolve("@spotify/basic-pitch"),
			`${origin}/basic-pitch/model.json`,
			file,
		],
		{ maxBuffer: 64 * 1024 * 1024, timeout: 240_000 },
	);
	const rows = JSON.parse(stdout) as [number, number, number, number][];
	return rows.map(([start, duration, pitch, amplitude]) => ({
		start,
		end: start + duration,
		pitch,
		amplitude,
	}));
}

async function download(url: string, file: string) {
	const res = await readBlob(url);
	if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
	await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
}

/** PCM float32 mono of `file` from `start` for `seconds` at `rate`. */
async function decode(file: string, start: number, seconds: number, rate: number) {
	if (!ffmpegPath) throw new Error("ffmpeg binary is not available on this platform");
	const out = `${file}.${rate}.${Math.round(start)}.raw`;
	await run(ffmpegPath, [
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
	]);
	const raw = await readFile(out);
	return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

const asBuffer = (data: Float32Array, sampleRate: number) =>
	({
		sampleRate,
		length: data.length,
		numberOfChannels: 1,
		getChannelData: () => data,
	}) as unknown as AudioBuffer;

export async function ensureSongNotes(songId: string, origin: string): Promise<void> {
	const song = await songForNotes(songId);
	if (!song || song.noAi || song.project.noAi) return;
	const stems = song.stems.filter((s) => s.status === "ready" && s.url);
	if (stems.length === 0 || stems.some((s) => s.playbackStatus === "pending")) return;
	const key = mixKeyOf(stems);
	const duration = Math.max(...stems.map((s) => s.durationSeconds ?? 0));
	if (duration <= 0) return;
	if (song.notesKey === key && song.notesDoneSeconds >= duration) return;
	// New stems since the last run (the key is written at the claim): start over.
	const fresh = song.notesKey !== key;
	if (!(await claimSongNotes(songId, key, fresh))) return;
	const started = Date.now();
	const dir = await mkdtemp(join(tmpdir(), "notes-"));
	try {
		const files: string[] = [];
		for (const [i, s] of stems.entries()) {
			const file = join(dir, `stem-${i}`);
			await download(s.playbackStatus === "ready" && s.playbackUrl ? s.playbackUrl : s.url, file);
			files.push(file);
		}
		// Which stems carry harmony: the same tonalness the browser uses, on 30 s.
		const tonal = await Promise.all(
			files.map(
				async (f) => extractFeatures(asBuffer(await decode(f, 0, 30, 32000), 32000), 30).tonal,
			),
		);
		const top = Math.max(...tonal, 1e-9);
		const weights = tonal.map((t) => t / top);
		let done = fresh ? 0 : song.notesDoneSeconds;
		while (done < duration && Date.now() - started < BUDGET_MS) {
			const seconds = Math.min(SEGMENT, duration - done);
			let mono: Float32Array | null = null;
			for (const [i, f] of files.entries()) {
				if (weights[i] < 0.35) continue;
				const data = await decode(f, done, seconds, MODEL_RATE);
				mono ??= new Float32Array(data.length);
				for (let k = 0; k < Math.min(data.length, mono.length); k++)
					mono[k] += data[k] * weights[i];
			}
			const notes: Note[] = [];
			if (mono) {
				let peak = 0;
				for (let k = 0; k < mono.length; k++) peak = Math.max(peak, Math.abs(mono[k]));
				if (peak > 0) for (let k = 0; k < mono.length; k++) mono[k] /= peak;
				const segmentFile = join(dir, `segment-${Math.round(done)}.raw`);
				await writeFile(segmentFile, Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength));
				for (const n of await transcribeFile(segmentFile, origin)) {
					notes.push({ ...n, start: done + n.start, end: done + n.end });
				}
			}
			done += seconds;
			await appendSongNotes(songId, notes, done);
		}
		if (done >= duration) await finishSongNotes(songId);
		else await releaseSongNotes(songId); // the next trigger continues from `done`
	} catch (e) {
		await releaseSongNotes(songId);
		throw e;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
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
