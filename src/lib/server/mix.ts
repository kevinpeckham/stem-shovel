import { accessOfUrl } from "#lib/utils/blobAccess.js";
import { mixPathname } from "#lib/server/blob.js";
import type { songForMix } from "#lib/server/data.js";
import { FADER_MAX } from "#lib/audio/engine.svelte.js";
import { FFMPEG_TIMEOUT_MS } from "#lib/constants/ffmpegTimeout.js";
import { BlobError, type DbError, type FfmpegError } from "#lib/server/effect/errors.js";
import { runJob } from "#lib/server/effect/runJob.js";
import { BlobStore, Db, Ffmpeg } from "#lib/server/effect/services.js";
import type * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schedule from "effect/Schedule";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * MP3 mixdowns, rendered server-side with ffmpeg from the playback renditions
 * (the sources when a rendition is missing). Two flavors:
 *
 * - **original**: every ready stem at unity, master at 1. Deterministic for a
 *   given set of stem files, so it is rendered once and cached in Blob
 *   (`song.mixUrl`, keyed by `song.mixKey`); a new upload, replacement or
 *   removal changes the key and the next request re-renders.
 * - **custom**: the gains the player has right now (mute, solo and faders
 *   folded in, plus master). Rendered on demand, never cached.
 *
 * Stereo 48 kHz 192 kbps. Each input is forced to stereo (mono renditions
 * are upmixed), scaled by its gain, summed without amix's automatic
 * attenuation, then master and a limiter so a hot sum clips gracefully
 * rather than digitally.
 */

const BITRATE = "192k";

export interface MixRequest {
	/** Effective gains and pans (-1 to 1, center when absent); a stem left out is silent. */
	stems: { id: string; gain: number; pan?: number }[];
	master: number;
}

export type Mixable = NonNullable<Awaited<ReturnType<typeof songForMix>>>;

/** Identifies the set of files an original mix is made from. */
/** A mix lives where its stems do: the first ready stem's store. */
function mixAccess(song: Pick<Mixable, "stems">) {
	const first = song.stems.find((s) => s.url);
	return first ? accessOfUrl(first.url) : "public";
}

function originalMixKey(song: Pick<Mixable, "stems">) {
	return mixKeyOf(song.stems);
}

/** The stem fields the key depends on; any row shape with them will do. */
export type MixKeyStem = Pick<
	Mixable["stems"][number],
	"id" | "playbackStatus" | "playbackUrl" | "url" | "gain"
> & { pan?: number | null };

/** The files and the default mix's gains: a saved mix renders a fresh original. */
export function mixKeyOf(stems: MixKeyStem[]) {
	// A pan of 0 adds nothing, so a song whose stems are all centered keeps the key it had before pans.
	const parts = stems
		.map((s) => `${s.id}:${playbackOrSource(s)}:${s.gain ?? 1}${s.pan ? `:${s.pan}` : ""}`)
		.sort();
	return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
}

/** The original mix is the song's default mix: every ready stem at its saved fader. */
function originalMixRequest(song: Mixable): MixRequest {
	return {
		stems: song.stems.map((s) => ({ id: s.id, gain: s.gain ?? 1, pan: s.pan ?? 0 })),
		master: 1,
	};
}

/** True when a custom request is just the original (so the cache can serve it). */
export function isOriginal(song: Mixable, req: MixRequest) {
	return (
		req.master === 1 &&
		req.stems.length === song.stems.length &&
		req.stems.every((s) => {
			const t = song.stems.find((t) => t.id === s.id);
			return !!t && Math.abs(s.gain - (t.gain ?? 1)) < 1e-6;
		})
	);
}

/** Parses `?stems=id:gain[:pan],id:gain[:pan]&master=m` against the song; null when malformed. */
export function parseMixRequest(song: Mixable, params: URLSearchParams): MixRequest | null {
	const stemsParam = params.get("stems");
	const masterParam = params.get("master") ?? "1";
	if (stemsParam === null) return originalMixRequest(song);
	const master = Number(masterParam);
	if (!Number.isFinite(master) || master < 0 || master > 1) return null;
	const stems: MixRequest["stems"] = [];
	for (const part of stemsParam.split(",").filter(Boolean)) {
		const [id, g = "1", p = "0"] = part.split(":");
		const gain = Number(g);
		const pan = Number(p);
		if (!song.stems.some((s) => s.id === id)) return null;
		if (!Number.isFinite(gain) || gain <= 0 || gain > FADER_MAX) return null;
		if (!Number.isFinite(pan) || pan < -1 || pan > 1) return null;
		if (stems.some((s) => s.id === id)) return null;
		stems.push({ id, gain: Math.round(gain * 1000) / 1000, pan: Math.round(pan * 100) / 100 });
	}
	if (stems.length === 0) return null;
	return { stems, master: Math.round(master * 1000) / 1000 };
}

function playbackOrSource(
	s: Pick<Mixable["stems"][number], "playbackStatus" | "playbackUrl" | "url">,
) {
	return s.playbackStatus === "ready" && s.playbackUrl ? s.playbackUrl : s.url;
}

/**
 * The pan as ffmpeg's `pan` filter, the StereoPannerNode's stereo law so
 * the download matches the player: left of center the right channel leans
 * into the left, right of center the other way. Nothing at center.
 */
export function panFilter(pan: number): string {
	if (!pan) return "";
	const f = (x: number) => x.toFixed(4);
	if (pan < 0) {
		const theta = ((pan + 1) * Math.PI) / 2;
		return `,pan=stereo|c0=c0+${f(Math.cos(theta))}*c1|c1=${f(Math.sin(theta))}*c1`;
	}
	const theta = (pan * Math.PI) / 2;
	return `,pan=stereo|c0=${f(Math.cos(theta))}*c0|c1=c1+${f(Math.sin(theta))}*c0`;
}

/** What a mix can fail with: Blob, the database, ffmpeg, or ffmpeg's time limit. */
export type MixError = BlobError | DbError | FfmpegError | Cause.TimeoutError;

/**
 * The retry's base delay and ffmpeg's time limit. Production uses the
 * defaults; a test provides shorter ones with `Effect.provideService`.
 */
export const MixTuning = Context.Reference<{
	readonly retryBase: Duration.Input;
	readonly ffmpegTimeout: Duration.Input;
}>("MixTuning", {
	defaultValue: () => ({
		retryBase: "500 millis",
		ffmpegTimeout: Duration.millis(FFMPEG_TIMEOUT_MS),
	}),
});

/** A temp directory removed when the scope closes: on success, failure and interruption. */
const tempDir = Effect.acquireRelease(
	Effect.promise(() => mkdtemp(join(tmpdir(), "mix-"))),
	(dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
);

/**
 * Worth another try: the store answering 5xx, or the connection failing
 * (undici's `TypeError: fetch failed`, a system error with a `code` such as
 * ECONNRESET mid-stream). A 404 is not, and neither is a plain throw such as
 * `readBlob`'s refusal of a URL outside our stores.
 */
function isTransient(e: BlobError) {
	if (e.status !== undefined) return e.status >= 500;
	const cause = e.cause;
	return (
		cause instanceof TypeError ||
		(typeof cause === "object" &&
			cause !== null &&
			typeof (cause as { code?: unknown }).code === "string")
	);
}

/** Streams one stem into `file`, retrying a transient failure up to three times with jittered backoff. */
function download(url: string, file: string): Effect.Effect<void, BlobError, BlobStore> {
	return Effect.gen(function* () {
		const { retryBase } = yield* MixTuning;
		const once = Effect.gen(function* () {
			const store = yield* BlobStore;
			const res = yield* store.read(url);
			if (!res.ok || !res.body)
				return yield* new BlobError({ op: "read", url, status: res.status });
			const body = res.body;
			yield* Effect.tryPromise({
				try: (signal) =>
					pipeline(Readable.fromWeb(body as never), createWriteStream(file), { signal }),
				catch: (cause) => new BlobError({ op: "read", url, cause }),
			});
		});
		yield* Effect.retry(once, {
			schedule: Schedule.jittered(Schedule.exponential(retryBase)),
			times: 3,
			while: isTransient,
		});
	}).pipe(Effect.withSpan("mix.download", { attributes: { url } }));
}

/** Renders the request to an MP3 and returns its bytes. */
function renderMixEffect(
	song: Mixable,
	req: MixRequest,
): Effect.Effect<Buffer, BlobError | FfmpegError | Cause.TimeoutError, BlobStore | Ffmpeg> {
	return Effect.gen(function* () {
		const inputs = [];
		for (const r of req.stems) {
			const stem = song.stems.find((s) => s.id === r.id);
			if (!stem) return yield* Effect.die(new Error(`stem ${r.id} is not in this song`));
			inputs.push({ url: playbackOrSource(stem), gain: r.gain, pan: r.pan ?? 0 });
		}
		const dir = yield* tempDir;
		// concurrency 3: one failure interrupts the other downloads.
		const files = yield* Effect.forEach(
			inputs,
			({ url }, i) => {
				const file = join(dir, `in-${i}`);
				return Effect.as(download(url, file), file);
			},
			{ concurrency: 3 },
		);
		const chains = inputs.map(
			({ gain, pan }, i) =>
				`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${gain}${panFilter(pan ?? 0)}[a${i}]`,
		);
		const sum = inputs.map((_, i) => `[a${i}]`).join("");
		const filter = [
			...chains,
			`${sum}amix=inputs=${inputs.length}:normalize=0:dropout_transition=0,volume=${req.master},alimiter=limit=0.98[out]`,
		].join(";");
		const output = join(dir, "mix.mp3");
		const ffmpeg = yield* Ffmpeg;
		const { ffmpegTimeout } = yield* MixTuning;
		// The timeout interrupts the run, and interrupting it kills the child.
		yield* ffmpeg
			.run(
				[
					"-hide_banner",
					"-loglevel",
					"error",
					"-y",
					...files.flatMap((f) => ["-i", f]),
					"-filter_complex",
					filter,
					"-map",
					"[out]",
					"-c:a",
					"libmp3lame",
					"-b:a",
					BITRATE,
					// The renditions carry MP4 branding and chapter atoms; start the tags clean.
					"-map_metadata",
					"-1",
					"-map_chapters",
					"-1",
					"-id3v2_version",
					"3",
					"-metadata",
					`title=${song.title}`,
					"-metadata",
					`artist=${song.project.account.name}`,
					output,
				],
				{ maxBuffer: 1024 * 1024 },
			)
			.pipe(Effect.timeout(ffmpegTimeout), Effect.withSpan("mix.ffmpeg"));
		return yield* Effect.promise(() => readFile(output));
	}).pipe(Effect.scoped, Effect.withSpan("mix.render"));
}

/** Uploads a rendered original, points the song at it, and deletes the one it replaces. */
function storeOriginal(
	song: Mixable,
	accountId: string,
	key: string,
	bytes: Buffer,
): Effect.Effect<void, BlobError | DbError, BlobStore | Db> {
	return Effect.gen(function* () {
		const store = yield* BlobStore;
		const db = yield* Db;
		const blob = yield* store.put(
			mixPathname(accountId, song.id, key),
			bytes,
			"audio/mpeg",
			mixAccess(song),
		);
		yield* db.setSongMix(song.id, { url: blob.url, key });
		if (song.mixUrl && song.mixUrl !== blob.url) yield* store.delete([song.mixUrl]);
	}).pipe(Effect.withSpan("mix.store"));
}

/** The original mix from the cache, rendering and caching it when the stems changed. */
function originalMixEffect(
	song: Mixable,
	accountId: string,
): Effect.Effect<Buffer, MixError, BlobStore | Db | Ffmpeg> {
	return Effect.gen(function* () {
		const key = originalMixKey(song);
		if (song.mixUrl && song.mixKey === key) {
			const url = song.mixUrl;
			const res = yield* (yield* BlobStore).read(url);
			if (res.ok)
				return Buffer.from(
					yield* Effect.tryPromise({
						try: () => res.arrayBuffer(),
						catch: (cause) => new BlobError({ op: "read", url, cause }),
					}),
				);
		}
		const bytes = yield* renderMixEffect(song, originalMixRequest(song));
		yield* storeOriginal(song, accountId, key, bytes);
		return bytes;
	}).pipe(Effect.withSpan("mix.original"));
}

/**
 * Keeps the cached original mix current after stems change, so the project
 * page can play it without waiting: renders when the key differs, once every
 * ready stem has a rendition (or has given up on one), under the song's lock.
 * The lock is released when the render fails or is interrupted; on success
 * `setSongMix` has already cleared it.
 */
export function ensureOriginalMixEffect(
	songId: string,
): Effect.Effect<void, MixError, BlobStore | Db | Ffmpeg> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const song = yield* db.songForMix(songId);
		if (!song || song.stems.length === 0) return;
		if (song.stems.some((s) => s.playbackStatus === null || s.playbackStatus === "pending")) return;
		const key = originalMixKey(song);
		if (song.mixUrl && song.mixKey === key) return;
		const claimed = yield* Effect.acquireRelease(db.claimSongMix(songId, key), (claimed, exit) =>
			claimed && Exit.isFailure(exit) ? Effect.ignore(db.releaseSongMix(songId)) : Effect.void,
		);
		if (!claimed) return;
		const bytes = yield* renderMixEffect(song, originalMixRequest(song));
		yield* storeOriginal(song, song.accountId, key, bytes);
	}).pipe(Effect.scoped, Effect.withSpan("mix.ensureOriginal"));
}

/** Renders the request to an MP3 and returns its bytes. */
export function renderMix(song: Mixable, req: MixRequest): Promise<Buffer> {
	return runJob("job.mix.render", renderMixEffect(song, req));
}

/** The original mix from the cache, rendering and caching it when the stems changed. */
export function originalMix(song: Mixable, accountId: string): Promise<Buffer> {
	return runJob("job.mix.original", originalMixEffect(song, accountId));
}

/**
 * Keeps the cached original mix current (see `ensureOriginalMixEffect`).
 * Called after a rendition completes, after a stem is removed, and from page
 * loads as a backstop.
 */
export function ensureOriginalMix(songId: string): Promise<void> {
	return runJob("job.mix.ensureOriginal", ensureOriginalMixEffect(songId));
}
