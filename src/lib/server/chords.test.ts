import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { DbError } from "#lib/server/effect/errors.js";
import { BlobStore, Db, Ffmpeg } from "#lib/server/effect/services.js";
import { TranscriberError } from "#lib/server/effect/transcriptionErrors.js";
import { JobTuning } from "#lib/server/effect/tuning.js";

/**
 * The chords job with fake layers: Blob answers the mix read, ffmpeg writes
 * four seconds of silence as the decoded mix, the CQT is the real one, and
 * the model child is a stand-in that answers logits favoring one class per
 * frame. The Beat This child is a stand-in too, answering a beat every
 * half second and a downbeat every two. The data functions are spies run
 * through a fake `Db.call`.
 */
const h = vi.hoisted(() => ({
	data: {
		songForChords: vi.fn(),
		claimSongChords: vi.fn(async () => true),
		setSongChords: vi.fn(async () => {}),
		releaseSongChords: vi.fn(async () => {}),
	},
	infer: { chordminiLogits: vi.fn() },
	beatThis: { beatThisLogits: vi.fn() },
}));
vi.mock("#lib/server/data.js", () => h.data);
vi.mock("#lib/server/blob.js", () => ({}));
vi.mock("./chordmini/infer.js", () => h.infer);
vi.mock("./beatThis/infer.js", () => h.beatThis);

const { ensureSongChordsEffect, CHORDMINI_VERSION, BEAT_THIS_VERSION } = await import("./chords");

/** Four seconds at 50 frames a second, the hop 441 at 22050 Hz. */
const BEAT_FRAMES = 1 + Math.floor((4 * 22050) / 441);
const BEATS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

const SONG = {
	id: "song-1",
	noAi: false,
	project: { noAi: false },
	mixUrl: "https://blob/mix.mp3",
	mixKey: "mix-key",
	chordsKey: null,
	beatsKey: null,
	chordsStartedAt: null,
};

function run() {
	const layer = Layer.mergeAll(
		Layer.succeed(BlobStore, {
			read: () => Effect.sync(() => new Response("mp3")),
			put: () => Effect.die(new Error("chords put nothing")),
			delete: () => Effect.die(new Error("chords delete nothing")),
		}),
		Layer.succeed(Db, {
			call: (op, run) =>
				Effect.tryPromise({ try: run, catch: (cause) => new DbError({ op, cause }) }),
			songForMix: () => Effect.die(new Error("unused")),
			claimSongMix: () => Effect.die(new Error("unused")),
			releaseSongMix: () => Effect.die(new Error("unused")),
			setSongMix: () => Effect.die(new Error("unused")),
		}),
		Layer.succeed(Ffmpeg, {
			run: (args) =>
				Effect.promise(async () => {
					await writeFile(args.at(-1)!, Buffer.alloc(4 * 22050 * 4));
					return { stdout: "", stderr: "" };
				}),
			stream: () => Effect.die(new Error("chords do not stream")),
		}),
	);
	const job = ensureSongChordsEffect("song-1").pipe(
		Effect.provide(layer),
		Effect.provideService(JobTuning, { retryBase: "1 millis", ffmpegTimeout: "10 seconds" }),
	);
	return Effect.runPromiseExit(job);
}

const chordsDirs = async () => (await readdir(tmpdir())).filter((d) => d.startsWith("chords-"));

beforeEach(() => {
	vi.clearAllMocks();
	h.data.claimSongChords.mockResolvedValue(true);
	h.data.songForChords.mockResolvedValue(SONG);
	// Class 0 (C:min) for the first half of the frames, class 169 (N) after.
	h.infer.chordminiLogits.mockImplementation(async (_f: Float32Array, frames: number) => {
		const out = new Float32Array(frames * 170);
		for (let f = 0; f < frames; f++) out[f * 170 + (f < frames / 2 ? 0 : 169)] = 5;
		return out;
	});
	// A peak every 25 frames (a beat every 0.5 s), a downbeat peak every 100 (every 2 s).
	h.beatThis.beatThisLogits.mockImplementation(async (_m: Float32Array, frames: number) => {
		const beat = new Float32Array(frames).fill(-5);
		const downbeat = new Float32Array(frames).fill(-5);
		for (let f = 0; f < frames; f += 25) beat[f] = 5;
		for (let f = 0; f < frames; f += 100) downbeat[f] = 5;
		return { beat, downbeat };
	});
});

describe("ensureSongChords", () => {
	test("reads the mix, runs the model and stores the runs under the mix key with the chart symbols, the tracker's beats beside them", async () => {
		const before = await chordsDirs();
		const exit = await run();
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(h.data.claimSongChords).toHaveBeenCalledWith("song-1");
		expect(h.infer.chordminiLogits).toHaveBeenCalledTimes(1);
		const [frames] = [h.infer.chordminiLogits.mock.calls[0][1] as number];
		expect(frames).toBe(1 + Math.floor((4 * 22050) / 2048));
		expect(h.data.setSongChords).toHaveBeenCalledTimes(1);
		const [id, key, runs, beats] = h.data.setSongChords.mock.calls[0] as unknown as [
			string,
			string,
			{ version: string; frameSec: number; frames: number; runs: unknown[] },
			unknown,
		];
		expect(id).toBe("song-1");
		expect(key).toBe("mix-key");
		expect(runs.version).toBe(CHORDMINI_VERSION);
		expect(runs.frameSec).toBeCloseTo(2048 / 22050, 9);
		expect(runs.frames).toBe(frames);
		expect(runs.runs).toEqual([
			{ start: 0, end: Math.ceil(frames / 2), label: "C:min", chord: "Cm" },
			{ start: Math.ceil(frames / 2), end: frames, label: "N", chord: "N.C." },
		]);
		// The tracker reads the same decode: its log-mel frames, in the job's scratch directory.
		expect(h.beatThis.beatThisLogits).toHaveBeenCalledTimes(1);
		const [mel, melFrames, dir] = h.beatThis.beatThisLogits.mock.calls[0] as [
			Float32Array,
			number,
			string,
		];
		expect(melFrames).toBe(BEAT_FRAMES);
		expect(mel).toHaveLength(BEAT_FRAMES * 128);
		expect(dir).toContain("chords-");
		expect(beats).toEqual({
			version: BEAT_THIS_VERSION,
			duration: 4,
			beats: BEATS,
			downbeats: [0, 2, 4],
		});
		expect(h.data.releaseSongChords).not.toHaveBeenCalled();
		expect(await chordsDirs()).toEqual(before);
	});
	test("a failed model run releases the claim, removes the temp dir and fails with it", async () => {
		h.infer.chordminiLogits.mockRejectedValue(new Error("wasm died"));
		const before = await chordsDirs();
		const exit = await run();
		if (!Exit.isFailure(exit)) throw new Error("expected a failure");
		expect(Cause.squash(exit.cause)).toBeInstanceOf(TranscriberError);
		expect(h.data.releaseSongChords).toHaveBeenCalledWith("song-1");
		expect(h.data.setSongChords).not.toHaveBeenCalled();
		expect(h.beatThis.beatThisLogits).not.toHaveBeenCalled();
		expect(await chordsDirs()).toEqual(before);
	});
	test("a failed tracker stores empty beats and still stores the chords", async () => {
		h.beatThis.beatThisLogits.mockRejectedValue(new Error("onnx died"));
		const before = await chordsDirs();
		const exit = await run();
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(h.data.setSongChords).toHaveBeenCalledTimes(1);
		const [id, key, runs, beats] = h.data.setSongChords.mock.calls[0] as unknown as [
			string,
			string,
			{ version: string; runs: unknown[] },
			unknown,
		];
		expect(id).toBe("song-1");
		expect(key).toBe("mix-key");
		expect(runs.version).toBe(CHORDMINI_VERSION);
		expect(runs.runs).toHaveLength(2);
		expect(beats).toEqual({ version: BEAT_THIS_VERSION, duration: 4, beats: [], downbeats: [] });
		expect(h.data.releaseSongChords).not.toHaveBeenCalled();
		expect(await chordsDirs()).toEqual(before);
	});
	test("chords read from this mix without its beats (or beats without chords): read again", async () => {
		h.data.songForChords.mockResolvedValue({ ...SONG, chordsKey: "mix-key" });
		expect(Exit.isSuccess(await run())).toBe(true);
		h.data.songForChords.mockResolvedValue({ ...SONG, chordsKey: "mix-key", beatsKey: "old" });
		expect(Exit.isSuccess(await run())).toBe(true);
		h.data.songForChords.mockResolvedValue({ ...SONG, beatsKey: "mix-key" });
		expect(Exit.isSuccess(await run())).toBe(true);
		expect(h.data.claimSongChords).toHaveBeenCalledTimes(3);
		expect(h.data.setSongChords).toHaveBeenCalledTimes(3);
		expect(h.beatThis.beatThisLogits).toHaveBeenCalledTimes(3);
	});
	test("nothing to do: chords and beats already read from this mix, no mix, no AI, or another run holds the claim", async () => {
		h.data.songForChords.mockResolvedValue({ ...SONG, chordsKey: "mix-key", beatsKey: "mix-key" });
		expect(Exit.isSuccess(await run())).toBe(true);
		h.data.songForChords.mockResolvedValue({ ...SONG, mixUrl: null, mixKey: null });
		expect(Exit.isSuccess(await run())).toBe(true);
		h.data.songForChords.mockResolvedValue({ ...SONG, project: { noAi: true } });
		expect(Exit.isSuccess(await run())).toBe(true);
		expect(h.data.claimSongChords).not.toHaveBeenCalled();
		h.data.songForChords.mockResolvedValue(SONG);
		h.data.claimSongChords.mockResolvedValue(false);
		expect(Exit.isSuccess(await run())).toBe(true);
		expect(h.infer.chordminiLogits).not.toHaveBeenCalled();
		expect(h.beatThis.beatThisLogits).not.toHaveBeenCalled();
		expect(h.data.releaseSongChords).not.toHaveBeenCalled();
	});
});
