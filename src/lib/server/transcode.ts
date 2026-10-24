import {
	claimDemoPeaks,
	claimDemoPlayback,
	claimMixPlayback,
	claimPlayback,
	claimRecordingPlayback,
	claimSessionPeaks,
	claimSessionPlayback,
	failDemoPlayback,
	failSessionPlayback,
	failMixPlayback,
	failPlayback,
	failRecordingPlayback,
	finishDemoPeaks,
	finishDemoPlayback,
	finishMixPlayback,
	finishPlayback,
	finishRecordingPlayback,
	finishSessionPeaks,
	finishSessionPlayback,
	finishStemMetadata,
	stemForMetadata,
	replaceRecordingSource,
	replaceStudioSourceFile,
	studioSourceForTranscode,
} from "#lib/server/data.js";
import { accessOfUrl } from "#lib/utils/blobAccess.js";
import { createPcm16Peaks } from "#lib/utils/pcm16Peaks.js";
import { studioSourceWantsFlac } from "#lib/utils/studioSourceWantsFlac.js";
import { silenceBounds, type SilenceBounds } from "#lib/utils/silenceBounds.js";
import { TRIM_MIN_SILENCE_SECONDS, TRIM_NOISE_DB } from "#lib/constants/trimSilence.js";
import { deleteBlobs, playbackPathname, putBlob, readBlob } from "#lib/server/blob.js";
import { ensureOriginalMix } from "#lib/server/mix.js";
import { ensureSongNotes } from "#lib/server/notes.js";
import ffmpegPath from "ffmpeg-static";
import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
 *
 * Lossless sources are also kept smaller here: a raw PCM take of the Idea
 * Recorder and a WAV source of the Studio (`flacStudioSources`) are
 * replaced by FLAC, the same samples at about half the bytes.
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

/**
 * Stems with no stored length, peaks or channel count (docs/uploads-and-blob.md,
 * "Stems measured after the fact"): the file is fetched, ffmpeg's probe
 * gives the channels and the peaks pass the length and the waveform, and
 * the row takes what it lacked. Idempotent: a repeat measures again and
 * writes nothing new.
 */
export async function measureStemMetadata(stemIds: string[]): Promise<void> {
	for (const id of stemIds) {
		const row = await stemForMetadata(id);
		if (!row) continue;
		const dir = await mkdtemp(join(tmpdir(), "stem-meta-"));
		try {
			const file = join(dir, "source");
			const res = await readBlob(row.url);
			if (!res.ok || !res.body)
				throw new Error(`${res.status} ${res.statusText} fetching ${row.url}`);
			await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
			const [probed, measured] = await Promise.all([probeStream(file), measurePeaks(file)]);
			await finishStemMetadata(id, { ...measured, ...probed });
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}
}

/**
 * How many channels a file has ("stereo", "mono", "2 channels"; 2 when it says nothing) and its sample
 * rate ("48000 Hz"; null when it says nothing), from ffmpeg's probe line.
 */
async function probeStream(file: string): Promise<{ channels: number; sampleRate: number | null }> {
	if (!ffmpegPath) return { channels: 2, sampleRate: null };
	try {
		await run(ffmpegPath, ["-hide_banner", "-i", file], { maxBuffer: 1024 * 1024 });
	} catch (e) {
		const err = String((e as { stderr?: string }).stderr ?? "");
		const line = err.match(/Audio: [^\n]*/)?.[0] ?? "";
		const hz = line.match(/(\d+) Hz/)?.[1];
		const sampleRate = hz ? Number(hz) : null;
		if (/\bmono\b/.test(line)) return { channels: 1, sampleRate };
		const n = line.match(/(\d+) channels/)?.[1];
		return { channels: n ? Math.max(1, Number(n)) : 2, sampleRate };
	}
	return { channels: 2, sampleRate: null };
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

/** Demo recordings become MP3s (192 kbps, source channels up to stereo), one at a time, each with its waveform measured. */
export async function renderDemos(demoIds: string[]): Promise<void> {
	for (const id of demoIds) await transcodeToMp3(id, DEMO_TARGET);
}

/**
 * The waveform of a demo or a session recording whose MP3 is there but
 * was never measured (rendered before the review shipped): fetched and
 * measured one at a time (docs/uploads-and-blob.md, "Sessions" review).
 */
export async function measureDemos(demoIds: string[]): Promise<void> {
	for (const id of demoIds) await measureRendition(id, claimDemoPeaks, finishDemoPeaks);
}
export async function measureSessions(recordingIds: string[]): Promise<void> {
	for (const id of recordingIds) await measureRendition(id, claimSessionPeaks, finishSessionPeaks);
}
async function measureRendition(
	id: string,
	claim: (id: string) => Promise<{ id: string; url: string } | null>,
	finish: (id: string, r: { peaks: number[]; durationSeconds: number }) => Promise<void>,
): Promise<void> {
	const claimed = await claim(id);
	if (!claimed) return;
	const dir = await mkdtemp(join(tmpdir(), "peaks-"));
	try {
		const file = join(dir, "rendition.mp3");
		const res = await readBlob(claimed.url);
		if (!res.ok || !res.body)
			throw new Error(`${res.status} ${res.statusText} fetching ${claimed.url}`);
		await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
		await finish(id, await measurePeaks(file));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** The waveform's rate: coarse frames of a tenth of a second, reduced to the bins at the end. */
const PEAKS_RATE = 8000;
const PEAKS_FRAME = PEAKS_RATE / 10;

/**
 * A file's waveform peaks and length (src/lib/utils/pcm16Peaks.ts): ffmpeg
 * decodes it to mono 16-bit PCM on its stdout, folded into peaks as it
 * streams, so an hour's recording costs a few floats per tenth of a second
 * and never sits decoded in memory.
 */
function measurePeaks(file: string): Promise<{ peaks: number[]; durationSeconds: number }> {
	return new Promise((resolve, reject) => {
		if (!ffmpegPath) {
			reject(new Error("ffmpeg binary is not available on this platform"));
			return;
		}
		const acc = createPcm16Peaks(PEAKS_FRAME);
		const child = spawn(ffmpegPath, [
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			file,
			"-vn",
			"-ac",
			"1",
			"-ar",
			String(PEAKS_RATE),
			"-f",
			"s16le",
			"-",
		]);
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => acc.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`ffmpeg exited ${code} measuring peaks: ${stderr.trim()}`));
				return;
			}
			const { peaks, samples } = acc.finish();
			resolve({ peaks, durationSeconds: samples / PEAKS_RATE });
		});
	});
}

/** Mixes (docs/mixes.md) get the same MP3. */
export async function renderMixes(mixIds: string[]): Promise<void> {
	for (const id of mixIds) await transcodeToMp3(id, MIX_TARGET);
}

/** Takes (docs/demo-recording.md) get the same MP3. */
export async function renderRecordings(recordingIds: string[]): Promise<void> {
	for (const id of recordingIds) await transcodeToMp3(id, RECORDING_TARGET);
}

/** Session recordings (docs/uploads-and-blob.md, "Sessions") get the same MP3, for playback and the session's download. */
export async function renderSessions(recordingIds: string[]): Promise<void> {
	for (const id of recordingIds) await transcodeToMp3(id, SESSION_TARGET);
}

/**
 * Studio sources the browser uploaded as WAV (docs/multitrack-recorder.md,
 * "Scale and structure") become FLAC: the same samples at about half the
 * bytes, which the browser decodes as it does the Idea Recorder's takes.
 * One at a time; a FLAC no smaller than the WAV (noise, or a file too
 * short to compress) is not kept. The row then points at the FLAC and the
 * WAV goes. A failure is logged and the next source still runs; the WAV
 * stays, so the song's next load asks again.
 */
export async function flacStudioSources(ids: string[]): Promise<void> {
	for (const id of ids) {
		try {
			await flacStudioSource(id);
		} catch (e) {
			console.error(`[studio-flac] ${id}:`, e);
		}
	}
}

/** A ready source with its file in Blob, still the WAV it was uploaded as. */
const dueForFlac = (row: Awaited<ReturnType<typeof studioSourceForTranscode>>) =>
	row?.status === "ready" && !!row.url && studioSourceWantsFlac({ ...row, name: row.pathname });

async function flacStudioSource(id: string): Promise<void> {
	const row = await studioSourceForTranscode(id);
	if (!row || !dueForFlac(row)) return;
	if (!ffmpegPath) throw new Error("ffmpeg binary is not available on this platform");
	const dir = await mkdtemp(join(tmpdir(), "studio-flac-"));
	try {
		const source = join(dir, "source.wav");
		const flac = join(dir, "source.flac");
		const res = await readBlob(row.url);
		if (!res.ok || !res.body)
			throw new Error(`${res.status} ${res.statusText} fetching ${row.url}`);
		await pipeline(Readable.fromWeb(res.body as never), createWriteStream(source));
		await run(
			ffmpegPath,
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-i",
				source,
				"-vn",
				"-map_metadata",
				"-1",
				"-c:a",
				"flac",
				"-compression_level",
				"5",
				flac,
			],
			{ maxBuffer: 1024 * 1024 },
		);
		const bytes = await readFile(flac);
		const { size } = await stat(source);
		if (bytes.byteLength >= size) return;
		const pathname = row.pathname.replace(/\.[a-z0-9]+$/i, "") + ".flac";
		const blob = await putBlob(pathname, bytes, "audio/flac", accessOfUrl(row.url));
		const replaced = await replaceStudioSourceFile(row.accountId, id, {
			url: blob.url,
			pathname,
			filename: row.filename.replace(/\.[a-z0-9]+$/i, "") + ".flac",
			contentType: "audio/flac",
			sizeBytes: bytes.byteLength,
			codec: "flac",
		});
		// Deleted while it converted: the FLAC goes too, the WAV went with the row.
		if (!replaced) {
			await deleteBlobs([blob.url]);
			return;
		}
		if (row.url !== blob.url) await deleteBlobs([row.url]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** The row family an MP3 is made for: how to claim it, record the result or give up. */
interface Mp3Target {
	claim: (id: string) => Promise<{
		url: string;
		pathname: string;
		playbackUrl: string | null;
		/** Takes only: the source's type and codec, and whether the recorder asked for a silence trim. */
		contentType?: string;
		codec?: string | null;
		trimSilence?: boolean;
	} | null>;
	finish: (
		id: string,
		r: { url: string; pathname: string; bytes: number; peaks?: number[]; durationSeconds?: number },
	) => Promise<void>;
	fail: (id: string) => Promise<void>;
	/** Demos and session recordings: the MP3's waveform and length are measured with it, for the review's waveform. */
	measure?: boolean;
	/** Set on takes: a raw PCM source (Chrome's lossless recording) is kept as FLAC instead, and a trim replaces the source too. */
	replaceSource?: (
		id: string,
		r: {
			url: string;
			pathname: string;
			filename: string;
			contentType: string;
			sizeBytes: number;
			codec: string | null;
			durationSeconds?: number;
		},
	) => Promise<void>;
}
const DEMO_TARGET: Mp3Target = {
	claim: claimDemoPlayback,
	finish: finishDemoPlayback,
	fail: failDemoPlayback,
	measure: true,
};
const MIX_TARGET: Mp3Target = {
	claim: claimMixPlayback,
	finish: finishMixPlayback,
	fail: failMixPlayback,
};
const SESSION_TARGET: Mp3Target = {
	claim: claimSessionPlayback,
	finish: finishSessionPlayback,
	fail: failSessionPlayback,
	measure: true,
};
const RECORDING_TARGET: Mp3Target = {
	claim: claimRecordingPlayback,
	finish: finishRecordingPlayback,
	fail: failRecordingPlayback,
	replaceSource: replaceRecordingSource,
};

/** Whether a file's audio is raw PCM (ffmpeg's probe line names the codec). */
async function isRawPcm(file: string): Promise<boolean> {
	if (!ffmpegPath) return false;
	try {
		await run(ffmpegPath, ["-hide_banner", "-i", file], { maxBuffer: 1024 * 1024 });
	} catch (e) {
		// ffmpeg exits 1 with no output file; the probe is in stderr.
		const err = String((e as { stderr?: string }).stderr ?? "");
		return /Audio: pcm_/.test(err);
	}
	return false;
}

/** Whether a file is an MP3 already (the probe's stream line): it serves as its own rendition (Kevin, 2026-10-19). */
async function isMp3(file: string): Promise<boolean> {
	if (!ffmpegPath) return false;
	try {
		await run(ffmpegPath, ["-hide_banner", "-i", file], { maxBuffer: 1024 * 1024 });
	} catch (e) {
		const err = String((e as { stderr?: string }).stderr ?? "");
		return /Audio: mp3/.test(err);
	}
	return false;
}

/**
 * Where a take's sound starts and ends, from a silencedetect pass over the
 * whole file; null when there is nothing worth cutting (src/lib/utils/silenceBounds.ts).
 */
async function findSilence(file: string): Promise<SilenceBounds | null> {
	if (!ffmpegPath) return null;
	try {
		const { stderr } = await run(
			ffmpegPath,
			[
				"-hide_banner",
				"-i",
				file,
				"-vn",
				"-af",
				`silencedetect=noise=${TRIM_NOISE_DB}dB:d=${TRIM_MIN_SILENCE_SECONDS}`,
				"-f",
				"null",
				"-",
			],
			{ maxBuffer: 4 * 1024 * 1024 },
		);
		return silenceBounds(stderr);
	} catch {
		return null; // an unreadable file: the MP3 step reports it
	}
}

/** `-ss`/`-to` after the input, so a re-encode cuts to the sample and a stream copy to the packet. */
const cut = (b: SilenceBounds | null) =>
	b ? ["-ss", b.start.toFixed(3), "-to", b.end.toFixed(3)] : [];

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
		const source = join(dir, "source");
		const output = join(dir, "demo.mp3");
		const res = await readBlob(claim.url);
		if (!res.ok || !res.body)
			throw new Error(`${res.status} ${res.statusText} fetching ${claim.url}`);
		await pipeline(Readable.fromWeb(res.body as never), createWriteStream(source));
		// The recorder may ask for the silence at both ends to be cut. The cut is
		// made on the source, and the MP3 below is made from the cut source, so
		// the two stay the same length and timecode.
		let input = source;
		const bounds = target.replaceSource && claim.trimSilence ? await findSilence(source) : null;
		// Chrome's lossless recording is raw PCM in WebM, twice the size it needs to be
		// and playable almost nowhere: the source becomes FLAC (same samples, half the bytes).
		if (target.replaceSource && (await isRawPcm(input))) {
			const flac = join(dir, "source.flac");
			await run(
				ffmpegPath,
				[
					"-hide_banner",
					"-loglevel",
					"error",
					"-y",
					"-i",
					input,
					...cut(bounds),
					"-vn",
					"-map_metadata",
					"-1",
					"-c:a",
					"flac",
					"-compression_level",
					"5",
					flac,
				],
				{ maxBuffer: 1024 * 1024 },
			);
			const bytes = await readFile(flac);
			const pathname = claim.pathname.replace(/\.[a-z0-9]+$/i, "") + ".flac";
			const blob = await putBlob(pathname, bytes, "audio/flac", accessOfUrl(claim.url));
			await target.replaceSource(id, {
				url: blob.url,
				pathname,
				filename: pathname.split("/").pop() ?? "take.flac",
				contentType: "audio/flac",
				sizeBytes: bytes.byteLength,
				codec: "flac",
				...(bounds ? { durationSeconds: bounds.end - bounds.start } : {}),
			});
			if (claim.url !== blob.url) await deleteBlobs([claim.url]);
			input = flac;
		} else if (target.replaceSource && bounds) {
			// Lossless sources (ALAC, FLAC) are re-encoded to the sample; a compressed
			// one (Opus, AAC) is stream-copied, cut at a packet, so nothing is re-encoded.
			const ext = claim.pathname.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin";
			const lossless = claim.codec === "alac" || claim.codec === "flac";
			const trimmed = join(dir, `trimmed.${ext}`);
			await run(
				ffmpegPath,
				[
					"-hide_banner",
					"-loglevel",
					"error",
					"-y",
					"-i",
					input,
					...cut(bounds),
					"-vn",
					"-map_metadata",
					"-1",
					"-c:a",
					lossless ? claim.codec! : "copy",
					trimmed,
				],
				{ maxBuffer: 1024 * 1024 },
			);
			const bytes = await readFile(trimmed);
			const pathname =
				claim.pathname.replace(/\.[a-z0-9]+$/i, "") + `-t${Date.now().toString(36)}.${ext}`;
			const contentType = claim.contentType ?? "application/octet-stream";
			const blob = await putBlob(pathname, bytes, contentType, accessOfUrl(claim.url));
			await target.replaceSource(id, {
				url: blob.url,
				pathname,
				filename: pathname.split("/").pop() ?? `take.${ext}`,
				contentType,
				sizeBytes: bytes.byteLength,
				codec: claim.codec ?? null,
				durationSeconds: bounds.end - bounds.start,
			});
			if (claim.url !== blob.url) await deleteBlobs([claim.url]);
			input = trimmed;
		}
		// An MP3 as uploaded is its own rendition: nothing to encode, one file kept,
		// played as it came (a second MP3 would cost storage and a little quality).
		if (input === source && /\.mp3$/i.test(claim.pathname) && (await isMp3(source))) {
			const { size } = await stat(source);
			const measured = target.measure ? await measurePeaks(source) : {};
			await target.finish(id, {
				url: claim.url,
				pathname: claim.pathname,
				bytes: size,
				...measured,
			});
			if (claim.playbackUrl && claim.playbackUrl !== claim.url)
				await deleteBlobs([claim.playbackUrl]);
			return;
		}
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
		// The waveform from the MP3 itself (what plays), so the peaks and the length match it to the sample.
		const measured = target.measure ? await measurePeaks(output) : {};
		await target.finish(id, { url: blob.url, pathname, bytes: bytes.byteLength, ...measured });
		// The old rendition goes, unless it was the source itself (an MP3 adopted earlier).
		if (claim.playbackUrl && claim.playbackUrl !== claim.url)
			await deleteBlobs([claim.playbackUrl]);
	} catch (e) {
		await target.fail(id);
		throw e;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
