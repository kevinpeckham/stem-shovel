import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { describe, expect, test, vi } from "vite-plus/test";
import { DbError } from "#lib/server/effect/errors.js";
import { EngraveError } from "#lib/server/effect/notationErrors.js";
import { BlobStore, Db, Ffmpeg } from "#lib/server/effect/services.js";

/**
 * The notation PDF job with fake layers and Verovio doubled: a render that
 * throws marks the row failed and still fails the job (so `eachJob` reports it).
 */
const h = vi.hoisted(() => ({
	data: {
		notationForPdf: vi.fn(async () => ({
			id: "n1",
			accountId: "a1",
			songId: "s1",
			status: "ready",
			url: "https://blob/score.musicxml",
			pathname: "accounts/a1/songs/s1/n1.musicxml",
			filename: "score.musicxml",
		})),
		setNotationPdf: vi.fn(async () => {}),
	},
	engrave: vi.fn(),
	puts: [] as string[],
}));
vi.mock("#lib/server/data.js", () => h.data);
vi.mock("#lib/server/blob.js", () => ({
	notationPdfPathname: () => "accounts/a1/songs/s1/n1.pdf",
}));
vi.mock("#lib/server/relocate.js", () => ({ accessOfPathname: async () => "public" }));
vi.mock("#lib/utils/engraveNotationPages.js", () => ({ engraveNotationPages: h.engrave }));
vi.mock("verovio/wasm", () => ({ default: async () => ({}) }));
vi.mock("verovio/esm", () => ({ LOG_OFF: 0, enableLog: () => {}, VerovioToolkit: class {} }));

const { renderNotationPdfEffect } = await import("./notationPdf");

const layer = Layer.mergeAll(
	Layer.succeed(BlobStore, {
		read: () => Effect.sync(() => new Response("<score/>")),
		put: (pathname) => Effect.sync(() => (h.puts.push(pathname), { url: "https://blob/n1.pdf" })),
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
		run: () => Effect.die(new Error("unused")),
		stream: () => Effect.die(new Error("unused")),
	}),
);

describe("renderNotationPdf", () => {
	test("a render that throws sets the status to failed and the error still fails the job", async () => {
		h.engrave.mockImplementation(() => {
			throw new Error("not a score");
		});
		const exit = await Effect.runPromiseExit(
			renderNotationPdfEffect("n1").pipe(Effect.provide(layer)),
		);
		if (!Exit.isFailure(exit)) throw new Error("expected a failure");
		const error = Cause.squash(exit.cause);
		expect(error).toBeInstanceOf(EngraveError);
		expect((error as EngraveError).message).toBe("Engraving score.musicxml failed: not a score");
		expect(h.data.setNotationPdf).toHaveBeenCalledExactlyOnceWith("n1", { pdfStatus: "failed" });
		expect(h.puts).toEqual([]);
	});

	test("the failure stays the render's when recording it fails too", async () => {
		h.data.setNotationPdf.mockClear().mockRejectedValueOnce(new Error("502"));
		const exit = await Effect.runPromiseExit(
			renderNotationPdfEffect("n1").pipe(Effect.provide(layer)),
		);
		if (!Exit.isFailure(exit)) throw new Error("expected a failure");
		expect(Cause.squash(exit.cause)).toBeInstanceOf(EngraveError);
		expect(h.data.setNotationPdf).toHaveBeenCalledTimes(1);
	});
});
