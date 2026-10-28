import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import ffmpegPath from "ffmpeg-static";
import { FfmpegError } from "./errors.js";
import { Ffmpeg } from "./services.js";
import { JobTuning } from "./tuning.js";
import type { Readable } from "node:stream";

/**
 * Fails at once when this platform has no ffmpeg binary, so a job can
 * give up before it downloads anything.
 */
export const requireFfmpeg: Effect.Effect<void, FfmpegError> = Effect.suspend(() =>
	ffmpegPath ? Effect.void : Effect.fail(FfmpegError.unavailable()),
);

interface RunOptions {
	maxBuffer?: number;
	/** How much of stderr a failure keeps (a probe reads its stream lines there). */
	stderrTail?: number;
	/** The span's name; `ffmpeg.run` when absent. */
	span?: string;
	/** Piped into ffmpeg's stdin, read as `-i pipe:0` (a source streamed from Blob, not downloaded). */
	input?: Readable;
}

/**
 * One ffmpeg run under `JobTuning.ffmpegTimeout`: the timeout interrupts
 * the run, and interrupting it kills the child.
 */
export function runFfmpeg(
	args: string[],
	options: RunOptions = {},
): Effect.Effect<{ stdout: string; stderr: string }, FfmpegError | Cause.TimeoutError, Ffmpeg> {
	const { span = "ffmpeg.run", ...run } = options;
	return Effect.gen(function* () {
		const ffmpeg = yield* Ffmpeg;
		const { ffmpegTimeout } = yield* JobTuning;
		return yield* ffmpeg.run(args, run).pipe(Effect.timeout(ffmpegTimeout));
	}).pipe(Effect.withSpan(span));
}

/**
 * An ffmpeg run whose stdout is consumed as it streams (`onStdout` per
 * chunk), under the same time limit and with the same kill on interruption.
 */
export function streamFfmpeg(
	args: string[],
	onStdout: (chunk: Buffer) => void,
	span = "ffmpeg.stream",
): Effect.Effect<{ stderr: string }, FfmpegError | Cause.TimeoutError, Ffmpeg> {
	return Effect.gen(function* () {
		const ffmpeg = yield* Ffmpeg;
		const { ffmpegTimeout } = yield* JobTuning;
		return yield* ffmpeg.stream(args, onStdout).pipe(Effect.timeout(ffmpegTimeout));
	}).pipe(Effect.withSpan(span));
}
