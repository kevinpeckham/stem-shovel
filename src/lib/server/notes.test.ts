import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vite-plus/test";
import { DbError, FfmpegError } from "#lib/server/effect/errors.js";
import { BlobStore, Db, Ffmpeg } from "#lib/server/effect/services.js";
import { JobTuning } from "#lib/server/effect/tuning.js";

/**
 * The transcription job with fake layers: Blob answers every read, the
 * data functions are spies run through a fake `Db.call`, and ffmpeg is a
 * fake that takes a while per decode. No audio is decoded and no model runs.
 */
const h = vi.hoisted(() => ({
	data: {
		songForNotes: vi.fn(),
		claimSongNotes: vi.fn(async () => true),
		appendSongNotes: vi.fn(async () => {}),
		finishSongNotes: vi.fn(async () => {}),
		releaseSongNotes: vi.fn(async () => {}),
	},
}));
vi.mock("#lib/server/data.js", () => h.data);
vi.mock("#lib/server/blob.js", () => ({}));

const { ensureSongNotesEffect } = await import("./notes");

const stem = (i: number) => ({
	id: `stem${i}`,
	status: "ready",
	url: `https://blob/${i}.wav`,
	playbackStatus: "ready",
	playbackUrl: `https://blob/${i}.m4a`,
	gain: 1,
	durationSeconds: 90,
});

function run(failing: (args: string[]) => boolean) {
	const flight = { now: 0, max: 0, ran: 0 };
	const layer = Layer.mergeAll(
		Layer.succeed(BlobStore, {
			read: () => Effect.sync(() => new Response("audio")),
			put: () => Effect.die(new Error("notes put nothing")),
			delete: () => Effect.die(new Error("notes delete nothing")),
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
				Effect.gen(function* () {
					flight.ran++;
					flight.now++;
					flight.max = Math.max(flight.max, flight.now);
					yield* Effect.sleep("20 millis");
					if (failing(args))
						return yield* new FfmpegError({ code: 1, stderr: "Invalid data", timedOut: false });
					yield* Effect.promise(() => writeFile(args.at(-1)!, Buffer.alloc(16)));
					return { stdout: "", stderr: "" };
				}).pipe(Effect.ensuring(Effect.sync(() => void flight.now--))),
			stream: () => Effect.die(new Error("notes do not stream")),
		}),
	);
	const job = ensureSongNotesEffect("song-1").pipe(
		Effect.provide(layer),
		Effect.provideService(JobTuning, { retryBase: "1 millis", ffmpegTimeout: "1 second" }),
	);
	return Effect.runPromiseExit(job).then((exit) => ({ exit, flight }));
}

const notesDirs = async () => (await readdir(tmpdir())).filter((d) => d.startsWith("notes-"));

describe("ensureSongNotes", () => {
	test("a failed decode releases the lock, removes the temp dir and fails with it; decodes run two at a time", async () => {
		h.data.songForNotes.mockResolvedValue({
			noAi: false,
			project: { noAi: false },
			notesKey: null,
			notesDoneSeconds: 0,
			stems: [0, 1, 2, 3, 4].map(stem),
		});
		const before = await notesDirs();
		const { exit, flight } = await run((args) => args[args.indexOf("-i") + 1].endsWith("stem-3"));
		if (!Exit.isFailure(exit)) throw new Error("expected a failure");
		expect(Cause.squash(exit.cause)).toBeInstanceOf(FfmpegError);
		expect(flight.max).toBe(2);
		expect(flight.ran).toBeGreaterThanOrEqual(4);
		expect(h.data.claimSongNotes).toHaveBeenCalledWith("song-1", expect.any(String), true);
		expect(h.data.releaseSongNotes).toHaveBeenCalledTimes(1);
		expect(h.data.appendSongNotes).not.toHaveBeenCalled();
		expect(h.data.finishSongNotes).not.toHaveBeenCalled();
		expect(await notesDirs()).toEqual(before);
	});
});
