import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
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

	test("a timeout interrupts a stream and kills the child", async () => {
		const marker = `title=effect-stream-kill-${process.pid}`;
		let bytes = 0;
		// Endless silence decoded to PCM on stdout: chunks arrive until the kill.
		const args = ["-f", "lavfi", "-i", "anullsrc", "-metadata", marker, "-f", "s16le", "-"];
		const job = Effect.gen(function* () {
			const ffmpeg = yield* Ffmpeg;
			return yield* ffmpeg
				.stream(args, (chunk) => (bytes += chunk.byteLength))
				.pipe(Effect.timeout("300 millis"));
		}).pipe(Effect.provide(Ffmpeg.live));
		const exit = await Effect.runPromiseExit(job);
		expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
			_tag: "TimeoutError",
		});
		expect(bytes).toBeGreaterThan(0);
		for (let i = 0; i < 20 && running(marker).length > 0; i++)
			await new Promise((r) => setTimeout(r, 50));
		expect(running(marker)).toEqual([]);
	});

	test("a stream that exits non-zero is an FfmpegError with the end of stderr", async () => {
		const job = Effect.gen(function* () {
			return yield* (yield* Ffmpeg).stream(
				["-hide_banner", "-i", "/nonexistent-input.wav", "-f", "s16le", "-"],
				() => {},
			);
		}).pipe(Effect.provide(Ffmpeg.live));
		const exit = await Effect.runPromiseExit(job);
		const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null;
		expect(error).toMatchObject({ _tag: "FfmpegError", code: 254, timedOut: false });
		expect((error as Error).message).toMatch(/^ffmpeg exited with 254: Error opening input/);
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
	/** A WAV of `seconds` of 8 kHz 16-bit mono silence, for stdin. */
	function wav(seconds: number) {
		const data = 8000 * 2 * seconds;
		const b = Buffer.alloc(44 + data);
		b.write("RIFF", 0);
		b.writeUInt32LE(36 + data, 4);
		b.write("WAVEfmt ", 8);
		b.writeUInt32LE(16, 16);
		b.writeUInt16LE(1, 20);
		b.writeUInt16LE(1, 22);
		b.writeUInt32LE(8000, 24);
		b.writeUInt32LE(16000, 28);
		b.writeUInt16LE(2, 32);
		b.writeUInt16LE(16, 34);
		b.write("data", 36);
		b.writeUInt32LE(data, 40);
		return b;
	}
	const fromStdin = (input: Readable, extra: string[] = []) =>
		Effect.gen(function* () {
			return yield* (yield* Ffmpeg).run(
				["-hide_banner", "-i", "pipe:0", ...extra, "-f", "null", "-"],
				{ input },
			);
		}).pipe(Effect.provide(Ffmpeg.live));

	test("an input is piped into stdin and read as `-i pipe:0`", async () => {
		const { stderr } = await Effect.runPromise(fromStdin(Readable.from([wav(3)])));
		expect(stderr).toMatch(/Input #0, wav, from 'pipe:0'/);
		expect(stderr).toMatch(/time=00:00:03\.00/);
	});

	test("ffmpeg stopping early (`-t`) is not a failure: the broken pipe is ignored", async () => {
		// Far more than the pipe buffers: ffmpeg exits with most of it unread.
		const { stderr } = await Effect.runPromise(fromStdin(Readable.from([wav(600)]), ["-t", "0.1"]));
		expect(stderr).toMatch(/time=00:00:00\.1/);
	});

	test("an input that breaks mid-file fails the run even though ffmpeg exits 0 on what it got", async () => {
		const input = new Readable({ read() {} });
		input.push(wav(1));
		setTimeout(() => input.destroy(new Error("socket hang up")), 50);
		const exit = await Effect.runPromiseExit(fromStdin(input));
		expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
			_tag: "FfmpegError",
			stderr: "input failed: socket hang up",
		});
	});
});
