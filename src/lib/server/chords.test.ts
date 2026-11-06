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
 * frame. The data functions are spies run through a fake `Db.call`.
 */
const h = vi.hoisted(() => ({
	data: {
		songForChords: vi.fn(),
		claimSongChords: vi.fn(async () => true),
		setSongChords: vi.fn(async () => {}),
		releaseSongChords: vi.fn(async () => {}),
	},
	infer: { chordminiLogits: vi.fn() },
}));
vi.mock("#lib/server/data.js", () => h.data);
vi.mock("#lib/server/blob.js", () => ({}));
vi.mock("./chordmini/infer.js", () => h.infer);

const { ensureSongChordsEffect, CHORDMINI_VERSION } = await import("./chords");

const SONG = {
	id: "song-1",
	noAi: false,
	project: { noAi: false },
	mixUrl: "https://blob/mix.mp3",
	mixKey: "mix-key",
	chordsKey: null,
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
});

describe("ensureSongChords", () => {
	test("reads the mix, runs the model and stores the runs under the mix key with the chart symbols", async () => {
		const before = await chordsDirs();
		const exit = await run();
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(h.data.claimSongChords).toHaveBeenCalledWith("song-1");
		expect(h.infer.chordminiLogits).toHaveBeenCalledTimes(1);
		const [frames] = [h.infer.chordminiLogits.mock.calls[0][1] as number];
		expect(frames).toBe(1 + Math.floor((4 * 22050) / 2048));
		expect(h.data.setSongChords).toHaveBeenCalledTimes(1);
		const [id, key, runs] = h.data.setSongChords.mock.calls[0] as unknown as [
			string,
			string,
			{ version: string; frameSec: number; frames: number; runs: unknown[] },
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
		expect(await chordsDirs()).toEqual(before);
	});
	test("nothing to do: chords already read from this mix, no mix, no AI, or another run holds the claim", async () => {
		h.data.songForChords.mockResolvedValue({ ...SONG, chordsKey: "mix-key" });
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
		expect(h.data.releaseSongChords).not.toHaveBeenCalled();
	});
});
