import {
	claimDemoPlayback,
	claimPlayback,
	claimRecordingPlayback,
	failDemoPlayback,
	failPlayback,
	failRecordingPlayback,
	finishDemoPlayback,
	finishPlayback,
	finishRecordingPlayback,
} from "$lib/server/data";
import { accessOfUrl } from "$lib/utils/blobAccess";
import { deleteBlobs, playbackPathname, putBlob, readBlob } from "$lib/server/blob";
import { ensureOriginalMix } from "$lib/server/mix";
import { ensureSongNotes } from "$lib/server/notes";
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
 * Runs in the jobs function (src/lib/server/jobs.ts) after the request that
 * made the stem ready, and again from the song page for any stem still
 * without one (never tried, failed a while ago, or stuck). `claimPlayback`
 * is the lock: a stem is rendered by one job at a time.
 */

const BITRATE = { mono: "128k", stereo: "192k" };
const run = promisify(execFile);

/**
 * Renders the stems in turn (one ffmpeg at a time keeps memory flat), then
 * refreshes the cached original mix of every song touched, then the notes
 * the chart draft reads (skipped for no-AI songs; resumes if cut short).
 */
export async function renderStems(stemIds: string[]): Promise<void> {
	const songIds = new Set<string>();
	for (const id of stemIds) {
		const songId = await transcodeStem(id);
		if (songId) songIds.add(songId);
	}
	for (const id of songIds) await ensureOriginalMix(id);
	for (const id of songIds) await ensureSongNotes(id);
}

/** Returns the stem's song id when a rendition was made, null when nothing was done. */
async function transcodeStem(stemId: string): Promise<string | null> {
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
		const res = await readBlob(claim.url);
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
		const blob = await putBlob(pathname, bytes, "audio/mp4", accessOfUrl(claim.url));
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

/** Demo recordings become MP3s (192 kbps, source channels up to stereo), one at a time. */
export async function renderDemos(demoIds: string[]): Promise<void> {
	for (const id of demoIds) await transcodeToMp3(id, DEMO_TARGET);
}

/** Takes (docs/demo-recording.md) get the same MP3. */
export async function renderRecordings(recordingIds: string[]): Promise<void> {
	for (const id of recordingIds) await transcodeToMp3(id, RECORDING_TARGET);
}

/** The row family an MP3 is made for: how to claim it, record the result or give up. */
interface Mp3Target {
	claim: (id: string) => Promise<{
		url: string;
		pathname: string;
		playbackUrl: string | null;
	} | null>;
	finish: (id: string, r: { url: string; pathname: string; bytes: number }) => Promise<void>;
	fail: (id: string) => Promise<void>;
}
const DEMO_TARGET: Mp3Target = {
	claim: claimDemoPlayback,
	finish: finishDemoPlayback,
	fail: failDemoPlayback,
};
const RECORDING_TARGET: Mp3Target = {
	claim: claimRecordingPlayback,
	finish: finishRecordingPlayback,
	fail: failRecordingPlayback,
};

/**
 * A demo as uploaded may be anything a phone produces — ALAC in .m4a, CAF,
 * AMR — which browsers cannot all play. The MP3 is what the page plays and
 * offers for download; the original stays in Blob.
 */
async function transcodeToMp3(id: string, target: Mp3Target): Promise<void> {
	const claim = await target.claim(id);
	if (!claim) return;
	if (!ffmpegPath) {
		await target.fail(id);
		throw new Error("ffmpeg binary is not available on this platform");
	}
	const dir = await mkdtemp(join(tmpdir(), "demo-"));
	try {
		const input = join(dir, "source");
		const output = join(dir, "demo.mp3");
		const res = await readBlob(claim.url);
		if (!res.ok || !res.body)
			throw new Error(`${res.status} ${res.statusText} fetching ${claim.url}`);
		await pipeline(Readable.fromWeb(res.body as never), createWriteStream(input));
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
				"-af",
				"aformat=channel_layouts=mono|stereo",
				"-ar",
				"44100",
				"-c:a",
				"libmp3lame",
				"-b:a",
				"192k",
				"-id3v2_version",
				"3",
				output,
			],
			{ maxBuffer: 1024 * 1024 },
		);
		const bytes = await readFile(output);
		const pathname =
			claim.pathname.replace(/\.[a-z0-9]+$/i, "") + `.play-${Date.now().toString(36)}.mp3`;
		const blob = await putBlob(pathname, bytes, "audio/mpeg", accessOfUrl(claim.url));
		await target.finish(id, { url: blob.url, pathname, bytes: bytes.byteLength });
		if (claim.playbackUrl) await deleteBlobs([claim.playbackUrl]);
	} catch (e) {
		await target.fail(id);
		throw e;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
