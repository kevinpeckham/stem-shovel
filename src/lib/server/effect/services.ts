/**
 * The services of the Effect pilot (docs/effect-adoption.md, Phase 1):
 * Blob, the database and ffmpeg as `Context.Service`s, with live layers
 * that wrap the existing modules, used by the media jobs (`mix.ts`,
 * `transcode.ts`). A test provides fake layers instead of `vi.mock`.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import ffmpegPath from "ffmpeg-static";
import { execFile, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BlobAccess } from "#lib/utils/blobAccess.js";
import { deleteBlobs, putBlob, readBlob } from "#lib/server/blob.js";
import { claimSongMix, releaseSongMix, setSongMix, songForMix } from "#lib/server/data.js";
import { BlobError, DbError, FfmpegError } from "./errors.js";

type SongForMix = Awaited<ReturnType<typeof songForMix>>;

/** Blob reads, uploads and deletes (`#lib/server/blob.js`). Not `Blob`: that is a global. */
export class BlobStore extends Context.Service<
	BlobStore,
	{
		/** The response as is, whatever its status: the caller decides what a 404 means. */
		readonly read: (url: string) => Effect.Effect<Response, BlobError>;
		readonly put: (
			pathname: string,
			body: Buffer | Uint8Array,
			contentType: string,
			access: BlobAccess,
		) => Effect.Effect<{ url: string }, BlobError>;
		readonly delete: (urls: string[]) => Effect.Effect<void, BlobError>;
	}
>()("BlobStore") {
	static readonly live = Layer.succeed(BlobStore, {
		read: (url) =>
			Effect.tryPromise({
				try: async () => readBlob(url),
				catch: (cause) => new BlobError({ op: "read", url, cause }),
			}),
		put: (pathname, body, contentType, access) =>
			Effect.tryPromise({
				try: async () => putBlob(pathname, Buffer.from(body), contentType, access),
				catch: (cause) => new BlobError({ op: "put", url: pathname, cause }),
			}),
		delete: (urls) =>
			Effect.tryPromise({
				try: async () => deleteBlobs(urls),
				catch: (cause) => new BlobError({ op: "delete", url: urls.join(" "), cause }),
			}),
	});
}

/**
 * The database (`#lib/server/data.js`): the song-mix rows as typed methods,
 * and `call` for the long tail, which wraps any data function's promise as
 * a `DbError` named `op` (a fake layer can switch on `op`).
 */
export class Db extends Context.Service<
	Db,
	{
		readonly call: <A>(op: string, run: () => Promise<A>) => Effect.Effect<A, DbError>;
		readonly songForMix: (songId: string) => Effect.Effect<SongForMix, DbError>;
		readonly claimSongMix: (songId: string, key: string) => Effect.Effect<boolean, DbError>;
		readonly releaseSongMix: (songId: string) => Effect.Effect<void, DbError>;
		readonly setSongMix: (
			songId: string,
			mix: { url: string; key: string } | null,
		) => Effect.Effect<void, DbError>;
	}
>()("Db") {
	static readonly live = Layer.succeed(Db, {
		call: db,
		songForMix: (songId) => db("songForMix", () => songForMix(songId)),
		claimSongMix: (songId, key) => db("claimSongMix", () => claimSongMix(songId, key)),
		releaseSongMix: (songId) => db("releaseSongMix", () => releaseSongMix(songId)),
		setSongMix: (songId, mix) => db("setSongMix", () => setSongMix(songId, mix)),
	});
}

/** `async` so a synchronous throw in `call` is a `DbError` too, not a defect. */
function db<A>(op: string, call: () => Promise<A>): Effect.Effect<A, DbError> {
	return Effect.tryPromise({
		try: async () => call(),
		catch: (cause) => new DbError({ op, cause }),
	});
}

const STDERR_TAIL = 2048;

/**
 * Runs the bundled ffmpeg: `run` collects stdout and stderr, `stream` hands
 * stdout over chunk by chunk as it arrives (a decode to PCM that should
 * never sit in memory whole). Interrupting either (a timeout, a sibling's
 * failure) kills the child. No timeout of their own: the caller applies
 * `Effect.timeout`, which interrupts (`effect/ffmpeg.ts`).
 */
export class Ffmpeg extends Context.Service<
	Ffmpeg,
	{
		readonly run: (
			args: string[],
			options?: {
				maxBuffer?: number;
				stderrTail?: number;
				/** Piped into ffmpeg's stdin (the args read it as `-i pipe:0`): a source too big for the disk. */
				input?: Readable;
			},
		) => Effect.Effect<{ stdout: string; stderr: string }, FfmpegError>;
		readonly stream: (
			args: string[],
			onStdout: (chunk: Buffer) => void,
		) => Effect.Effect<{ stderr: string }, FfmpegError>;
	}
>()("Ffmpeg") {
	static readonly live = Layer.succeed(Ffmpeg, {
		run: (args, options) =>
			Effect.callback<{ stdout: string; stderr: string }, FfmpegError>((resume) => {
				if (!ffmpegPath) {
					options?.input?.destroy();
					resume(Effect.fail(FfmpegError.unavailable()));
					return;
				}
				// A failure reading the input (the Blob stream breaking mid-file) fails the run even
				// when ffmpeg, seeing the end of its stdin, exits 0 on what it got.
				let inputError: Error | null = null;
				const child = execFile(
					ffmpegPath,
					args,
					{ maxBuffer: options?.maxBuffer ?? 1024 * 1024 },
					(error, stdout, stderr) => {
						if (!error && inputError)
							return resume(
								Effect.fail(
									new FfmpegError({
										code: null,
										stderr: `input failed: ${inputError.message}`,
										timedOut: false,
									}),
								),
							);
						if (!error) return resume(Effect.succeed({ stdout, stderr }));
						const code = typeof error.code === "number" ? error.code : null;
						resume(
							Effect.fail(
								new FfmpegError({
									code,
									signal: error.signal ?? null,
									stderr: (stderr || error.message).slice(-(options?.stderrTail ?? STDERR_TAIL)),
									timedOut: false,
								}),
							),
						);
					},
				);
				const input = options?.input;
				if (input && child.stdin) {
					const stdin = child.stdin;
					// ffmpeg may stop reading before the end (a probe, `-t`): EPIPE on its stdin is not
					// a failure, and the source is destroyed with it, so the download stops.
					let stdinClosed = false;
					const closed = () => {
						stdinClosed = true;
					};
					stdin.on("error", closed);
					stdin.on("close", closed);
					input.on("error", (e) => {
						if (!stdinClosed) inputError = e;
					});
					pipeline(input, stdin).catch(() => {});
				}
				return Effect.sync(() => {
					input?.destroy();
					child.kill();
				});
			}),
		stream: (args, onStdout) =>
			Effect.callback<{ stderr: string }, FfmpegError>((resume) => {
				if (!ffmpegPath) {
					resume(Effect.fail(FfmpegError.unavailable()));
					return;
				}
				const child = spawn(ffmpegPath, args);
				let stderr = "";
				child.stdout.on("data", onStdout);
				child.stderr.on("data", (chunk: Buffer) => {
					stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL);
				});
				child.on("error", (e) =>
					resume(Effect.fail(new FfmpegError({ code: null, stderr: e.message, timedOut: false }))),
				);
				child.on("close", (code, signal) =>
					resume(
						code === 0
							? Effect.succeed({ stderr })
							: Effect.fail(new FfmpegError({ code, signal, stderr, timedOut: false })),
					),
				);
				return Effect.sync(() => {
					child.kill();
				});
			}),
	});
}

/** Every service a job may need. */
export type Services = BlobStore | Db | Ffmpeg;

export const LiveLayer = Layer.mergeAll(BlobStore.live, Db.live, Ffmpeg.live);
