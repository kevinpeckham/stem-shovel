import { claimPlayback, failPlayback, finishPlayback } from "$lib/server/data";
import { deleteBlobs, playbackPathname, putBlob } from "$lib/server/blob";
import { ensureOriginalMix } from "$lib/server/mix";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

/**
 * Playback renditions. A stem's source (often a 70 MB WAV) stays in Blob for
 * downloads; the player streams an AAC-LC M4A made from it here, about a
 * tenth of the size, which also means a tenth of the decode time and Blob
 * egress per listen. AAC because every browser's decodeAudioData takes it
 * (Safari and iPads included), which is not verified for Opus.
 *
 * Runs in the background of the request that made the stem ready
 * (`waitUntil`, so the response is not held) and again from the song page for
 * any stem still without one (never tried, failed a while ago, or stuck).
 * `claimPlayback` is the lock: a stem is rendered by one request at a time.
 */

const BITRATE = { mono: "128k", stereo: "192k" };
const run = promisify(execFile);

/** Vercel's request context keeps the function alive for the promise; elsewhere it just runs. */
export function background(work: () => Promise<void>) {
	const promise = work().catch((e) => console.error("[transcode]", e));
	const ctx = (
		globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } }>
	)[Symbol.for("@vercel/request-context")];
	ctx?.get?.()?.waitUntil?.(promise);
}

/**
 * Renders the stems in turn (one ffmpeg at a time keeps memory flat), then
 * refreshes the cached original mix of every song touched.
 */
export function schedulePlayback(stemIds: string[]) {
	if (stemIds.length === 0) return;
	background(async () => {
		const songIds = new Set<string>();
		for (const id of stemIds) {
			const songId = await transcodeStem(id);
			if (songId) songIds.add(songId);
		}
		for (const id of songIds) await ensureOriginalMix(id);
	});
}

/** Returns the stem's song id when a rendition was made, null when nothing was done. */
export async function transcodeStem(stemId: string): Promise<string | null> {
	const claim = await claimPlayback(stemId);
	if (!claim) return null;
	if (!ffmpegPath) {
		await failPlayback(stemId);
		throw new Error("ffmpeg binary is not available on this platform");
	}
	const dir = await mkdtemp(join(tmpdir(), "stem-"));
	try {
		const input = join(dir, "source");
		const output = join(dir, "playback.m4a");
		const res = await fetch(claim.url);
		if (!res.ok || !res.body)
			throw new Error(`${res.status} ${res.statusText} fetching ${claim.url}`);
		await pipeline(Readable.fromWeb(res.body as never), createWriteStream(input));

		const mono = claim.channels === 1;
		await run(
			ffmpegPath,
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-i",
				input,
				"-vn",
				"-map_metadata",
				"-1",
				"-ar",
				"48000",
				...(mono ? ["-ac", "1"] : []),
				"-c:a",
				"aac",
				"-b:a",
				mono ? BITRATE.mono : BITRATE.stereo,
				"-movflags",
				"+faststart",
				output,
			],
			{ maxBuffer: 1024 * 1024 },
		);

		const bytes = await readFile(output);
		const pathname = playbackPathname(claim.pathname);
		const blob = await putBlob(pathname, bytes, "audio/mp4");
		await finishPlayback(stemId, { url: blob.url, pathname, bytes: bytes.byteLength });
		if (claim.playbackUrl) await deleteBlobs([claim.playbackUrl]);
		return claim.songId;
	} catch (e) {
		await failPlayback(stemId);
		throw e;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
