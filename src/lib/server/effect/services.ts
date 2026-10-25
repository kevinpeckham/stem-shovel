/**
 * The services of the Effect pilot (docs/effect-adoption.md, Phase 1):
 * Blob, the database and ffmpeg as `Context.Service`s, with live layers
 * that wrap the existing modules. Nothing outside `src/lib/server/mix.ts`
 * uses them yet. A test provides fake layers instead of `vi.mock`.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
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
				try: () => readBlob(url),
				catch: (cause) => new BlobError({ op: "read", url, cause }),
			}),
		put: (pathname, body, contentType, access) =>
			Effect.tryPromise({
				try: () => putBlob(pathname, Buffer.from(body), contentType, access),
				catch: (cause) => new BlobError({ op: "put", url: pathname, cause }),
			}),
		delete: (urls) =>
			Effect.tryPromise({
				try: () => deleteBlobs(urls),
				catch: (cause) => new BlobError({ op: "delete", url: urls.join(" "), cause }),
			}),
	});
}

/** The song-mix rows (`#lib/server/data.js`). */
export class Db extends Context.Service<
	Db,
	{
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
		songForMix: (songId) => db("songForMix", () => songForMix(songId)),
		claimSongMix: (songId, key) => db("claimSongMix", () => claimSongMix(songId, key)),
		releaseSongMix: (songId) => db("releaseSongMix", () => releaseSongMix(songId)),
		setSongMix: (songId, mix) => db("setSongMix", () => setSongMix(songId, mix)),
	});
}

function db<A>(op: string, call: () => Promise<A>): Effect.Effect<A, DbError> {
	return Effect.tryPromise({ try: call, catch: (cause) => new DbError({ op, cause }) });
}

const STDERR_TAIL = 2048;

/**
 * Runs the bundled ffmpeg. Interrupting the effect (a timeout, a sibling's
 * failure) kills the child. No timeout of its own: the caller applies
 * `Effect.timeout`, which interrupts.
 */
export class Ffmpeg extends Context.Service<
	Ffmpeg,
	{
		readonly run: (
			args: string[],
			options?: { maxBuffer?: number },
		) => Effect.Effect<{ stdout: string; stderr: string }, FfmpegError>;
	}
>()("Ffmpeg") {
	static readonly live = Layer.succeed(Ffmpeg, {
		run: (args, options) =>
			Effect.callback<{ stdout: string; stderr: string }, FfmpegError>((resume) => {
				if (!ffmpegPath) {
					resume(
						Effect.fail(
							new FfmpegError({
								code: null,
								stderr: "ffmpeg binary is not available on this platform",
								timedOut: false,
							}),
						),
					);
					return;
				}
				const child = execFile(
					ffmpegPath,
					args,
					{ maxBuffer: options?.maxBuffer ?? 1024 * 1024 },
					(error, stdout, stderr) => {
						if (!error) return resume(Effect.succeed({ stdout, stderr }));
						const code = typeof error.code === "number" ? error.code : null;
						resume(
							Effect.fail(
								new FfmpegError({
									code,
									signal: error.signal ?? null,
									stderr: (stderr || error.message).slice(-STDERR_TAIL),
									timedOut: false,
								}),
							),
						);
					},
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
