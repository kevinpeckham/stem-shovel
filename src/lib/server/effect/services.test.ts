import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { execFileSync } from "node:child_process";
import { describe, expect, test, vi } from "vite-plus/test";

// The live Blob and Db layers wrap these; only the Ffmpeg layer runs here.
vi.mock("#lib/server/data.js", () => ({}));
vi.mock("#lib/server/blob.js", () => ({}));

const { Ffmpeg } = await import("./services");

/** ffmpeg processes still running with this test's marker in their arguments. */
function running(marker: string) {
	try {
		return execFileSync("pgrep", ["-f", "-x", `.*ffmpeg.*${marker}.*`])
			.toString()
			.trim()
			.split("\n")
			.filter(Boolean);
	} catch {
		return [];
	}
}

describe("Ffmpeg.live", () => {
	test("a timeout interrupts the run and kills the child", async () => {
		const marker = `title=effect-kill-${process.pid}`;
		// A silent source with no end: ffmpeg runs until it is killed.
		const args = ["-f", "lavfi", "-i", "anullsrc", "-metadata", marker, "-f", "null", "-"];
		const job = Effect.gen(function* () {
			const ffmpeg = yield* Ffmpeg;
			return yield* ffmpeg.run(args).pipe(Effect.timeout("300 millis"));
		}).pipe(Effect.provide(Ffmpeg.live));
		const exit = await Effect.runPromiseExit(job);
		expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
			_tag: "TimeoutError",
		});
		// SIGTERM takes a moment: give the child up to a second to go.
		for (let i = 0; i < 20 && running(marker).length > 0; i++)
			await new Promise((r) => setTimeout(r, 50));
		expect(running(marker)).toEqual([]);
	});

	test("a non-zero exit is an FfmpegError with the end of stderr", async () => {
		const job = Effect.gen(function* () {
			return yield* (yield* Ffmpeg).run([
				"-hide_banner",
				"-i",
				"/nonexistent-input.wav",
				"-f",
				"null",
				"-",
			]);
		}).pipe(Effect.provide(Ffmpeg.live));
		const exit = await Effect.runPromiseExit(job);
		const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null;
		expect(error).toMatchObject({ _tag: "FfmpegError", code: 254, timedOut: false });
		expect((error as Error).message).toMatch(/^ffmpeg exited with 254: Error opening input/);
	});
});
