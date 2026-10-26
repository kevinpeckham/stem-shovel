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
import { peakLevels, silentRightChannel } from "#lib/utils/silentRightChannel.js";
import {
	loudnormApplyFilter,
	loudnormMeasureFilter,
	parseLoudnorm,
	peakLimiterFilter,
	type LoudnormMeasurement,
} from "#lib/utils/loudnorm.js";
import { CLIPPED_PEAK_DB, LEVEL_MAX_SECONDS } from "#lib/constants/sessionLoudness.js";
import { ffmpegDuration } from "#lib/utils/ffmpegDuration.js";
import { TRIM_MIN_SILENCE_SECONDS, TRIM_NOISE_DB } from "#lib/constants/trimSilence.js";
import type { JobKind } from "#lib/val/JobSchema.js";
import { playbackPathname } from "#lib/server/blob.js";
import { ensureOriginalMix } from "#lib/server/mix.js";
import { ensureSongNotes } from "#lib/server/notes.js";
import { eachJob } from "#lib/server/eachJob.js";
import { downloadToFile } from "#lib/server/effect/blobIo.js";
import type { BlobError, DbError, FfmpegError } from "#lib/server/effect/errors.js";
import { requireFfmpeg, runFfmpeg, streamFfmpeg } from "#lib/server/effect/ffmpeg.js";
import { tempDir } from "#lib/server/effect/resources.js";
import { runJob } from "#lib/server/effect/runJob.js";
import { BlobStore, Db, type Services } from "#lib/server/effect/services.js";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

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
 *
 * Each id is an Effect program (docs/effect-adoption.md, Phase 2) run by
 * `runJob` under `eachJob`: the claim is a scoped resource failed on any
 * failure or interruption, the temp dir is scoped, Blob reads retry a
 * transient failure, and every ffmpeg runs under `JobTuning`'s time limit
 * with the child killed when it is reached.
 */

const BITRATE = { mono: "128k", stereo: "192k" };

/** What a media job can fail with: Blob, the database, ffmpeg, or ffmpeg's time limit. */
type JobError = BlobError | DbError | FfmpegError | Cause.TimeoutError;
type Job<A> = Effect.Effect<A, JobError, Services>;

/** Runs `job` for each id under eachJob (one at a time, a failure reported and the rest still run). */
function eachRun(kind: JobKind, ids: readonly string[], job: (id: string) => Job<unknown>) {
	return eachJob(kind, ids, async (id) => {
		await runJob(`job.${kind}`, job(id));
	});
}

/**
 * A row's claim, held for the scope: when the work after it fails or is
 * interrupted, `fail` marks the row failed (so the next visit retries);
 * on success nothing is released, the work's own finish having settled the row.
 */
function claimOrFail<C>(
	kind: JobKind,
	id: string,
	claim: (id: string) => Promise<C | null | undefined>,
	fail: (id: string) => Promise<unknown>,
) {
	return Effect.gen(function* () {
		const db = yield* Db;
		return yield* Effect.acquireRelease(
			db.call(`${kind}:claim`, () => claim(id)),
			(claimed, exit) =>
				claimed && Exit.isFailure(exit)
					? Effect.ignore(db.call(`${kind}:fail`, () => fail(id)))
					: Effect.void,
		);
	});
}

const readBytes = (file: string) => Effect.promise(() => readFile(file));
const sizeOf = (file: string) => Effect.promise(() => stat(file)).pipe(Effect.map((s) => s.size));

/**
 * Renders the stems in turn (one ffmpeg at a time keeps memory flat), then
 * refreshes the cached original mix of every song touched, then the notes
 * the chart draft reads (skipped for no-AI songs; resumes if cut short).
 */
export async function renderStems(stemIds: string[]): Promise<void> {
	const songIds = new Set<string>();
	await eachJob("stem-playback", stemIds, async (id) => {
		const songId = await runJob("job.stem-playback", transcodeStem(id));
		if (songId) songIds.add(songId);
	});
	await eachJob("mix", [...songIds], ensureOriginalMix);
	await eachJob("notes", [...songIds], ensureSongNotes);
}

/**
 * Stems with no stored length, peaks or channel count (docs/uploads-and-blob.md,
 * "Stems measured after the fact"): the file is fetched, ffmpeg's probe
 * gives the channels and the peaks pass the length and the waveform, and
 * the row takes what it lacked. Idempotent: a repeat measures again and
 * writes nothing new.
 */
export async function measureStemMetadata(stemIds: string[]): Promise<void> {
	await eachRun("stem-metadata", stemIds, (id) =>
		Effect.gen(function* () {
			const db = yield* Db;
			const row = yield* db.call("stem-metadata:read", () => stemForMetadata(id));
			if (!row) return;
			const file = join(yield* tempDir("stem-meta-"), "source");
			yield* downloadToFile(row.url, file);
			const [probed, measured] = yield* Effect.all([probeStream(file), measurePeaks(file)], {
				concurrency: 2,
			});
			yield* db.call("stem-metadata:finish", () =>
				finishStemMetadata(id, { ...measured, ...probed }),
			);
		}).pipe(Effect.scoped, Effect.withSpan("transcode.stemMetadata", { attributes: { id } })),
	);
}

/** ffmpeg's probe stderr can be long (tags, chapters, cover art) before the line that matters. */
const PROBE_STDERR = 64 * 1024;

/**
 * ffmpeg's probe: `-i file` with no output exits 1 with the stream lines in
 * stderr, so that exit is the result, not a failure (and so is an ffmpeg
 * that cannot run: the caller's defaults). Only the time limit fails it.
 */
function probe(file: string): Effect.Effect<string, Cause.TimeoutError, Services> {
	return runFfmpeg(["-hide_banner", "-i", file], {
		stderrTail: PROBE_STDERR,
		span: "transcode.probe",
	}).pipe(
		Effect.as(""),
		Effect.catchTag("FfmpegError", (e) => Effect.succeed(e.stderr)),
	);
}

/**
 * How many channels a file has ("stereo", "mono", "2 channels"; 2 when it says nothing) and its sample
 * rate ("48000 Hz"; null when it says nothing), from ffmpeg's probe line.
 */
function probeStream(file: string) {
	return Effect.map(probe(file), (err) => {
		const line = err.match(/Audio: [^\n]*/)?.[0] ?? "";
		const hz = line.match(/(\d+) Hz/)?.[1];
		const sampleRate = hz ? Number(hz) : null;
		if (/\bmono\b/.test(line)) return { channels: 1, sampleRate };
		const n = line.match(/(\d+) channels/)?.[1];
		return { channels: n ? Math.max(1, Number(n)) : 2, sampleRate };
	});
}

/** Returns the stem's song id when a rendition was made, null when nothing was done. */
function transcodeStem(stemId: string): Job<string | null> {
	return Effect.gen(function* () {
		const claim = yield* claimOrFail("stem-playback", stemId, claimPlayback, failPlayback);
		if (!claim) return null;
		yield* requireFfmpeg;
		const dir = yield* tempDir("stem-");
		const input = join(dir, "source");
		const output = join(dir, "playback.m4a");
		yield* downloadToFile(claim.url, input);

		const mono = claim.channels === 1;
		yield* runFfmpeg(
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
			{ span: "transcode.stem.encode" },
		);

		const bytes = yield* readBytes(output);
		const pathname = playbackPathname(claim.pathname);
		const store = yield* BlobStore;
		const blob = yield* store.put(pathname, bytes, "audio/mp4", accessOfUrl(claim.url));
		yield* (yield* Db).call("stem-playback:finish", () =>
			finishPlayback(stemId, { url: blob.url, pathname, bytes: bytes.byteLength }),
		);
		if (claim.playbackUrl) yield* store.delete([claim.playbackUrl]);
		return claim.songId;
	}).pipe(Effect.scoped, Effect.withSpan("transcode.stem", { attributes: { stemId } }));
}

/** Demo recordings become MP3s (192 kbps, source channels up to stereo), one at a time, each with its waveform measured. */
export async function renderDemos(demoIds: string[]): Promise<void> {
	await eachRun("demo-playback", demoIds, (id) => transcodeToMp3(id, DEMO_TARGET));
}

/**
 * The waveform of a demo or a session recording whose MP3 is there but
 * was never measured (rendered before the review shipped): fetched and
 * measured one at a time (docs/uploads-and-blob.md, "Sessions" review).
 */
export async function measureDemos(demoIds: string[]): Promise<void> {
	await eachRun("demo-peaks", demoIds, (id) =>
		measureRendition("demo-peaks", id, claimDemoPeaks, finishDemoPeaks),
	);
}
export async function measureSessions(recordingIds: string[]): Promise<void> {
	await eachRun("session-peaks", recordingIds, (id) =>
		measureRendition("session-peaks", id, claimSessionPeaks, finishSessionPeaks),
	);
}
function measureRendition(
	kind: JobKind,
	id: string,
	claim: (id: string) => Promise<{ id: string; url: string } | null>,
	finish: (id: string, r: { peaks: number[]; durationSeconds: number }) => Promise<void>,
): Job<void> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const claimed = yield* db.call(`${kind}:claim`, () => claim(id));
		if (!claimed) return;
		const file = join(yield* tempDir("peaks-"), "rendition.mp3");
		yield* downloadToFile(claimed.url, file);
		const measured = yield* measurePeaks(file);
		yield* db.call(`${kind}:finish`, () => finish(id, measured));
	}).pipe(Effect.scoped, Effect.withSpan("transcode.measureRendition", { attributes: { id } }));
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
function measurePeaks(file: string) {
	return Effect.suspend(() => {
		const acc = createPcm16Peaks(PEAKS_FRAME);
		return streamFfmpeg(
			[
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
			],
			(chunk) => acc.push(chunk),
			"transcode.peaks",
		).pipe(
			Effect.map(() => {
				const { peaks, samples } = acc.finish();
				return { peaks, durationSeconds: samples / PEAKS_RATE };
			}),
		);
	});
}

/** Mixes (docs/mixes.md) get the same MP3. */
export async function renderMixes(mixIds: string[]): Promise<void> {
	await eachRun("mix-playback", mixIds, (id) => transcodeToMp3(id, MIX_TARGET));
}

/** Takes (docs/demo-recording.md) get the same MP3. */
export async function renderRecordings(recordingIds: string[]): Promise<void> {
	await eachRun("recording-playback", recordingIds, (id) => transcodeToMp3(id, RECORDING_TARGET));
}

/** Session recordings (docs/uploads-and-blob.md, "Sessions") get the same MP3, for playback and the session's download. */
export async function renderSessions(recordingIds: string[]): Promise<void> {
	await eachRun("session-playback", recordingIds, (id) => transcodeToMp3(id, SESSION_TARGET));
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
			await runJob("job.studio-flac", flacStudioSource(id));
		} catch (e) {
			console.error(`[studio-flac] ${id}:`, e);
		}
	}
}

/** A ready source with its file in Blob, still the WAV it was uploaded as. */
const dueForFlac = (row: Awaited<ReturnType<typeof studioSourceForTranscode>>) =>
	row?.status === "ready" && !!row.url && studioSourceWantsFlac({ ...row, name: row.pathname });

function flacStudioSource(id: string): Job<void> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const row = yield* db.call("studio-flac:read", () => studioSourceForTranscode(id));
		if (!row || !dueForFlac(row)) return;
		yield* requireFfmpeg;
		const dir = yield* tempDir("studio-flac-");
		const source = join(dir, "source.wav");
		const flac = join(dir, "source.flac");
		yield* downloadToFile(row.url, source);
		yield* runFfmpeg(
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
			{ span: "transcode.studioFlac.encode" },
		);
		const bytes = yield* readBytes(flac);
		if (bytes.byteLength >= (yield* sizeOf(source))) return;
		const pathname = row.pathname.replace(/\.[a-z0-9]+$/i, "") + ".flac";
		const store = yield* BlobStore;
		const blob = yield* store.put(pathname, bytes, "audio/flac", accessOfUrl(row.url));
		const replaced = yield* db.call("studio-flac:replace", () =>
			replaceStudioSourceFile(row.accountId, id, {
				url: blob.url,
				pathname,
				filename: row.filename.replace(/\.[a-z0-9]+$/i, "") + ".flac",
				contentType: "audio/flac",
				sizeBytes: bytes.byteLength,
				codec: "flac",
			}),
		);
		// Deleted while it converted: the FLAC goes too, the WAV went with the row.
		if (!replaced) return yield* store.delete([blob.url]);
		if (row.url !== blob.url) yield* store.delete([row.url]);
	}).pipe(Effect.scoped, Effect.withSpan("transcode.studioFlac", { attributes: { id } }));
}

/** The row family an MP3 is made for: how to claim it, record the result or give up. */
interface Mp3Target {
	/** The job kind, which names the target's database calls and its span. */
	kind: JobKind;
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
	/** A browser's recording (the Idea Recorder, the session recorder): a stereo file with sound on the left only is folded to mono (`leftOnly`). */
	fromRecorder?: boolean;
	/** Session recordings: declipped when the capture hit full scale, then leveled to `SESSION_LOUDNESS` (docs/uploads-and-blob.md, "Leveling"). */
	level?: boolean;
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
	kind: "demo-playback",
	fromRecorder: true,
	claim: claimDemoPlayback,
	finish: finishDemoPlayback,
	fail: failDemoPlayback,
	measure: true,
};
const MIX_TARGET: Mp3Target = {
	kind: "mix-playback",
	claim: claimMixPlayback,
	finish: finishMixPlayback,
	fail: failMixPlayback,
};
const SESSION_TARGET: Mp3Target = {
	kind: "session-playback",
	fromRecorder: true,
	level: true,
	claim: claimSessionPlayback,
	finish: finishSessionPlayback,
	fail: failSessionPlayback,
	measure: true,
};
const RECORDING_TARGET: Mp3Target = {
	kind: "recording-playback",
	fromRecorder: true,
	claim: claimRecordingPlayback,
	finish: finishRecordingPlayback,
	fail: failRecordingPlayback,
	replaceSource: replaceRecordingSource,
};

/** Whether a file's audio is raw PCM (ffmpeg's probe line names the codec). */
const isRawPcm = (file: string) => Effect.map(probe(file), (err) => /Audio: pcm_/.test(err));

/** Whether a file is an MP3 already (the probe's stream line): it serves as its own rendition (Kevin, 2026-10-19). */
const isMp3 = (file: string) => Effect.map(probe(file), (err) => /Audio: mp3/.test(err));

/**
 * Where a take's sound starts and ends, from a silencedetect pass over the
 * whole file; null when there is nothing worth cutting (src/lib/utils/silenceBounds.ts).
 */
function findSilence(file: string): Effect.Effect<SilenceBounds | null, never, Services> {
	return runFfmpeg(
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
		{ maxBuffer: 4 * 1024 * 1024, span: "transcode.silence" },
	).pipe(
		Effect.map(({ stderr }) => silenceBounds(stderr)),
		// An unreadable file (or one that will not finish): the MP3 step reports it.
		Effect.orElseSucceed(() => null),
	);
}

/**
 * One `astats` pass over the file, its report (stderr) for two readings:
 * whether the recording has sound on the left channel only
 * (src/lib/utils/silentRightChannel.ts: a phone's mono microphone written
 * to a stereo file with the right channel silent, as iOS did through a
 * `MediaStreamAudioDestinationNode` before the recorder's stereo fill,
 * static/worklets/stereo-fill.js; Kevin, 2026-10-26), and whether a
 * channel hit full scale (`peakLevels`, for the declipper). An unreadable
 * file reads as neither.
 */
function channelStats(file: string): Effect.Effect<string, never, Services> {
	return runFfmpeg(
		[
			"-hide_banner",
			"-i",
			file,
			"-vn",
			"-af",
			"astats=measure_overall=none:measure_perchannel=Peak_level",
			"-f",
			"null",
			"-",
		],
		{ maxBuffer: 4 * 1024 * 1024, span: "transcode.channelStats" },
	).pipe(
		Effect.map(({ stderr }) => stderr),
		Effect.orElseSucceed(() => ""),
	);
}

/**
 * The leveling's first pass (src/lib/utils/loudnorm.ts): `loudnorm`
 * measures the file after the same shaping filters the encode will apply
 * (the fold, the declipper), and prints the numbers the second pass
 * needs. Null when the pass fails or prints nothing usable (a silent or
 * very short file): the encode then runs without leveling.
 */
function measureLoudness(
	file: string,
	shaping: string,
): Effect.Effect<LoudnormMeasurement | null, never, Services> {
	return runFfmpeg(
		[
			"-hide_banner",
			"-i",
			file,
			"-vn",
			"-af",
			`${shaping},${loudnormMeasureFilter()}`,
			"-f",
			"null",
			"-",
		],
		{ maxBuffer: 4 * 1024 * 1024, span: "transcode.measureLoudness" },
	).pipe(
		Effect.map(({ stderr }) => parseLoudnorm(stderr)),
		Effect.orElseSucceed(() => null),
	);
}

/** `-ss`/`-to` after the input, so a re-encode cuts to the sample and a stream copy to the packet. */
const cut = (b: SilenceBounds | null) =>
	b ? ["-ss", b.start.toFixed(3), "-to", b.end.toFixed(3)] : [];

type Mp3Claim = NonNullable<Awaited<ReturnType<Mp3Target["claim"]>>>;
type ReplaceSource = NonNullable<Mp3Target["replaceSource"]>;

/**
 * A take's source replaced before its MP3 is made: raw PCM kept as FLAC,
 * or the silence the recorder asked to lose cut off. Returns the file the
 * MP3 is made from (the source as downloaded when nothing changed).
 */
function replaceTakeSource(
	id: string,
	kind: JobKind,
	replaceSource: ReplaceSource,
	claim: Mp3Claim,
	source: string,
): Job<string> {
	return Effect.gen(function* () {
		// The recorder may ask for the silence at both ends to be cut. The cut is
		// made on the source, and the MP3 is made from the cut source, so the two
		// stay the same length and timecode.
		const bounds = claim.trimSilence ? yield* findSilence(source) : null;
		// Chrome's lossless recording is raw PCM in WebM, twice the size it needs to be
		// and playable almost nowhere: the source becomes FLAC (same samples, half the bytes).
		if (yield* isRawPcm(source))
			return yield* flacTake(id, kind, replaceSource, claim, source, bounds);
		if (bounds) return yield* trimTake(id, kind, replaceSource, claim, source, bounds);
		return source;
	}).pipe(Effect.withSpan("transcode.replaceTakeSource", { attributes: { id } }));
}

/** A raw PCM take as FLAC (cut when `bounds` says so), put in Blob and made the take's source. */
function flacTake(
	id: string,
	kind: JobKind,
	replaceSource: ReplaceSource,
	claim: Mp3Claim,
	source: string,
	bounds: SilenceBounds | null,
): Job<string> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const store = yield* BlobStore;
		const flac = join(dirname(source), "source.flac");
		yield* runFfmpeg(
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-i",
				source,
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
			{ span: "transcode.mp3.flacSource" },
		);
		const bytes = yield* readBytes(flac);
		const pathname = claim.pathname.replace(/\.[a-z0-9]+$/i, "") + ".flac";
		const blob = yield* store.put(pathname, bytes, "audio/flac", accessOfUrl(claim.url));
		yield* db.call(`${kind}:replaceSource`, () =>
			replaceSource(id, {
				url: blob.url,
				pathname,
				filename: pathname.split("/").pop() ?? "take.flac",
				contentType: "audio/flac",
				sizeBytes: bytes.byteLength,
				codec: "flac",
				...(bounds ? { durationSeconds: bounds.end - bounds.start } : {}),
			}),
		);
		if (claim.url !== blob.url) yield* store.delete([claim.url]);
		return flac;
	});
}

/**
 * A take cut to `bounds`: lossless sources (ALAC, FLAC) are re-encoded to
 * the sample; a compressed one (Opus, AAC) is stream-copied, cut at a
 * packet, so nothing is re-encoded. Put in Blob and made the take's source.
 */
function trimTake(
	id: string,
	kind: JobKind,
	replaceSource: ReplaceSource,
	claim: Mp3Claim,
	source: string,
	bounds: SilenceBounds,
): Job<string> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const store = yield* BlobStore;
		const ext = claim.pathname.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin";
		const lossless = claim.codec === "alac" || claim.codec === "flac";
		const trimmed = join(dirname(source), `trimmed.${ext}`);
		yield* runFfmpeg(
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-i",
				source,
				...cut(bounds),
				"-vn",
				"-map_metadata",
				"-1",
				"-c:a",
				lossless ? claim.codec! : "copy",
				trimmed,
			],
			{ span: "transcode.mp3.trim" },
		);
		const bytes = yield* readBytes(trimmed);
		const pathname =
			claim.pathname.replace(/\.[a-z0-9]+$/i, "") + `-t${Date.now().toString(36)}.${ext}`;
		const contentType = claim.contentType ?? "application/octet-stream";
		const blob = yield* store.put(pathname, bytes, contentType, accessOfUrl(claim.url));
		yield* db.call(`${kind}:replaceSource`, () =>
			replaceSource(id, {
				url: blob.url,
				pathname,
				filename: pathname.split("/").pop() ?? `take.${ext}`,
				contentType,
				sizeBytes: bytes.byteLength,
				codec: claim.codec ?? null,
				durationSeconds: bounds.end - bounds.start,
			}),
		);
		if (claim.url !== blob.url) yield* store.delete([claim.url]);
		return trimmed;
	});
}

/**
 * A demo as uploaded may be anything a phone produces — ALAC in .m4a, CAF,
 * AMR — which browsers cannot all play. The MP3 is what the page plays and
 * offers for download; the original stays in Blob. The claim is failed when
 * anything after it fails or is interrupted, even past a source already
 * replaced, so the row is retried.
 */
function transcodeToMp3(id: string, target: Mp3Target): Job<void> {
	return Effect.gen(function* () {
		const claim = yield* claimOrFail(target.kind, id, target.claim, target.fail);
		if (!claim) return;
		yield* requireFfmpeg;
		const db = yield* Db;
		const store = yield* BlobStore;
		const dir = yield* tempDir("demo-");
		const source = join(dir, "source");
		const output = join(dir, "demo.mp3");
		yield* downloadToFile(claim.url, source);
		const input = target.replaceSource
			? yield* replaceTakeSource(id, target.kind, target.replaceSource, claim, source)
			: source;
		// An MP3 as uploaded is its own rendition: nothing to encode, one file kept,
		// played as it came (a second MP3 would cost storage and a little quality).
		if (input === source && /\.mp3$/i.test(claim.pathname) && (yield* isMp3(source))) {
			const size = yield* sizeOf(source);
			const measured = target.measure ? yield* measurePeaks(source) : {};
			yield* db.call(`${target.kind}:finish`, () =>
				target.finish(id, { url: claim.url, pathname: claim.pathname, bytes: size, ...measured }),
			);
			if (claim.playbackUrl && claim.playbackUrl !== claim.url)
				yield* store.delete([claim.playbackUrl]);
			return;
		}
		// A left-only recording becomes a mono MP3: the one channel with sound, which plays on both sides.
		const stats = target.fromRecorder ? yield* channelStats(input) : "";
		const fold = silentRightChannel(stats);
		const shape = fold ? "pan=mono|c0=c0" : "aformat=channel_layouts=mono|stereo";
		// Leveling (sessions): a capture that hit full scale is declipped first, then two-pass loudnorm
		// brings the set to SESSION_LOUDNESS with true-peak headroom. A set too long for the two passes
		// (or of unknown length) gets the limiter alone; a failed measurement leaves the level alone.
		const clipped = target.level === true && peakLevels(stats).some((p) => p >= CLIPPED_PEAK_DB);
		const shaping = clipped ? `${shape},adeclip` : shape;
		const seconds = ffmpegDuration(stats);
		const twoPass = target.level === true && seconds !== null && seconds <= LEVEL_MAX_SECONDS;
		const leveled = twoPass ? yield* measureLoudness(input, shaping) : null;
		const filters = leveled
			? `${shaping},${loudnormApplyFilter(leveled)}`
			: target.level && !twoPass
				? `${shaping},${peakLimiterFilter()}`
				: shaping;
		yield* runFfmpeg(
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
				filters,
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
			{ span: "transcode.mp3.encode" },
		);
		const bytes = yield* readBytes(output);
		const pathname =
			claim.pathname.replace(/\.[a-z0-9]+$/i, "") + `.play-${Date.now().toString(36)}.mp3`;
		const blob = yield* store.put(pathname, bytes, "audio/mpeg", accessOfUrl(claim.url));
		// The waveform from the MP3 itself (what plays), so the peaks and the length match it to the sample.
		const measured = target.measure ? yield* measurePeaks(output) : {};
		yield* db.call(`${target.kind}:finish`, () =>
			target.finish(id, { url: blob.url, pathname, bytes: bytes.byteLength, ...measured }),
		);
		// The old rendition goes, unless it was the source itself (an MP3 adopted earlier).
		if (claim.playbackUrl && claim.playbackUrl !== claim.url)
			yield* store.delete([claim.playbackUrl]);
	}).pipe(Effect.scoped, Effect.withSpan(`transcode.${target.kind}`, { attributes: { id } }));
}
