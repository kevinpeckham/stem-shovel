import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vite-plus/test";
import { DbError } from "#lib/server/effect/errors.js";
import { BlobStore, Db, Ffmpeg } from "#lib/server/effect/services.js";
import { JobTuning } from "#lib/server/effect/tuning.js";

/**
 * The DAWproject export with fake layers: an ffmpeg that never finishes is
 * cut off at the time limit, and the user's outcome follows as for any
 * failure (the row removed, a notification saying why) while the job succeeds.
 */
const h = vi.hoisted(() => ({
	data: {
		dawprojectExportJob: vi.fn(async () => ({
			id: "f1",
			accountId: "a1",
			songId: null,
			ideaId: "i1",
			pathname: "accounts/a1/songs/s1/f1.dawproject",
			audio: "flac",
			uploadedBy: "u1",
		})),
		studioExportInput: vi.fn(async () => ({
			title: "Night Song",
			notes: "",
			revision: 3,
			arrangement: { clips: [{ sourceId: "src1" }] },
			sources: [
				{
					id: "src1",
					url: "https://blob/src1.wav",
					filename: "take.wav",
					durationSeconds: 1,
					sampleRate: 48000,
					channels: 2,
				},
			],
		})),
		failFile: vi.fn(async () => {}),
		finishDawprojectFile: vi.fn(),
		songExportMetadata: vi.fn(),
	},
	notifyDawprojectExport: vi.fn(async () => {}),
}));
vi.mock("#lib/server/data.js", () => h.data);
vi.mock("#lib/server/blob.js", () => ({}));
vi.mock("#lib/server/notifications.js", () => ({
	notifyDawprojectExport: h.notifyDawprojectExport,
}));
vi.mock("#lib/server/relocate.js", () => ({ accessOfPathname: async () => "public" }));
vi.mock("#lib/server/siteOrigin.js", () => ({ SITE_ORIGIN: "https://example.test" }));

const { renderDawprojectExportEffect } = await import("./dawprojectExport");

const layer = Layer.mergeAll(
	Layer.succeed(BlobStore, {
		read: () => Effect.sync(() => new Response("audio")),
		put: () => Effect.die(new Error("nothing should be stored")),
		delete: () => Effect.die(new Error("nothing is deleted")),
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
		run: () => Effect.never,
		stream: () => Effect.die(new Error("unused")),
	}),
);

describe("renderDawprojectExport", () => {
	test("an ffmpeg past the time limit removes the row and tells the user, and the job succeeds", async () => {
		const dirs = async () => (await readdir(tmpdir())).filter((d) => d.startsWith("dawproject-"));
		const before = await dirs();
		const exit = await Effect.runPromiseExit(
			renderDawprojectExportEffect("f1").pipe(
				Effect.provide(layer),
				Effect.provideService(JobTuning, { retryBase: "1 millis", ffmpegTimeout: "30 millis" }),
			),
		);
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(h.data.failFile).toHaveBeenCalledExactlyOnceWith("a1", "f1");
		expect(h.notifyDawprojectExport).toHaveBeenCalledExactlyOnceWith("u1", "a1", {
			title: "Night Song",
			failed: "Converting a recording took too long.",
		});
		expect(h.data.finishDawprojectFile).not.toHaveBeenCalled();
		expect(await dirs()).toEqual(before);
	});
});
