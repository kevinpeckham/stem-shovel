import {
	dawprojectExportJob,
	failFile,
	finishDawprojectFile,
	songExportMetadata,
	studioExportInput,
	type DawprojectAudio,
} from "#lib/server/data.js";
import { downloadToFile } from "#lib/server/effect/blobIo.js";
import { DawprojectError } from "#lib/server/effect/dawprojectErrors.js";
import type { BlobError, DbError, FfmpegError } from "#lib/server/effect/errors.js";
import { requireFfmpeg, runFfmpeg } from "#lib/server/effect/ffmpeg.js";
import { tempDir } from "#lib/server/effect/resources.js";
import { runJob } from "#lib/server/effect/runJob.js";
import { BlobStore, Db, type Services } from "#lib/server/effect/services.js";
import { notifyDawprojectExport } from "#lib/server/notifications.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { SITE_ORIGIN } from "#lib/server/siteOrigin.js";
import { dawproject, type DawprojectAudio as DawprojectAudioFile } from "#lib/utils/dawproject.js";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { strToU8, zipSync, type Zippable } from "fflate";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/** The audio inside the archive: FLAC by default (lossless, half the bytes), or WAV at 24 or 16 bits. */
const AUDIO: Record<DawprojectAudio, { ext: string; args: string[]; type: string }> = {
	flac: { ext: "flac", args: ["-c:a", "flac", "-compression_level", "5"], type: "audio/flac" },
	wav24: { ext: "wav", args: ["-c:a", "pcm_s24le"], type: "audio/wav" },
	wav16: { ext: "wav", args: ["-c:a", "pcm_s16le"], type: "audio/wav" },
};

const LABEL: Record<DawprojectAudio, string> = {
	flac: "FLAC",
	wav24: "24-bit WAV",
	wav16: "16-bit WAV",
};

/** The finished file's description on the song page. */
function descriptionOf(
	title: string,
	revision: number,
	recordings: number,
	format: DawprojectAudio,
) {
	return `A DAWproject of the Dawn song “${title}” (revision ${revision}), ${recordings} ${recordings === 1 ? "recording" : "recordings"} as ${LABEL[format]}. Opens in Bitwig Studio, Studio One, Cubase, Nuendo and Dawn.`;
}

type Source = { id: string; url: string; filename: string };

/** One source fetched and transcoded to the archive's format; the fetched copy is removed once encoded. */
function encodeSource(s: Source, dir: string, format: (typeof AUDIO)[DawprojectAudio]) {
	return Effect.gen(function* () {
		const source = join(dir, `${s.id}.src`);
		yield* downloadToFile(s.url, source).pipe(
			Effect.catchTag("BlobError", (e) =>
				Effect.fail(
					new DawprojectError({
						message: e.status
							? `${e.status} fetching ${s.filename}`
							: `Could not fetch ${s.filename}`,
						cause: e,
					}),
				),
			),
		);
		const out = join(dir, `${s.id}.${format.ext}`);
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
				...format.args,
				out,
			],
			{ maxBuffer: 1024 * 1024, span: "dawproject.encode" },
		);
		const bytes = yield* Effect.promise(() => readFile(out));
		yield* Effect.promise(() => rm(source, { force: true }));
		return bytes;
	});
}

type Job = NonNullable<Awaited<ReturnType<typeof dawprojectExportJob>>>;
type ExportError = BlobError | DbError | FfmpegError | DawprojectError | Cause.TimeoutError;

/** What the user reads when the export fails. */
function failureText(e: ExportError): string {
	if (Cause.isTimeoutError(e)) return "Converting a recording took too long.";
	return e.message;
}

/**
 * Builds the archive, stores it, finishes the row and tells the user.
 * `named` hears the Dawn song's title as soon as it is known, so a later
 * failure's notification can name it.
 */
function buildExport(
	job: Job,
	named: (title: string) => void,
): Effect.Effect<void, ExportError, Services> {
	return Effect.gen(function* () {
		const db = yield* Db;
		yield* requireFfmpeg.pipe(
			Effect.catchTag("FfmpegError", () =>
				Effect.fail(new DawprojectError({ message: "The audio tools are not available here." })),
			),
		);
		const dir = yield* tempDir("dawproject-");
		const input = yield* db.call("dawproject-export:input", () =>
			studioExportInput(job.accountId, job.ideaId),
		);
		if (!input) return yield* new DawprojectError({ message: "The Dawn song is gone" });
		const title = input.title;
		named(title);
		if (!input.arrangement)
			return yield* new DawprojectError({ message: "The Dawn song has nothing saved yet" });
		const a = input.arrangement;
		const wanted = new Set(a.clips.map((c) => c.sourceId).filter((id): id is string => !!id));
		const audio = new Map<string, DawprojectAudioFile>();
		const entries: Zippable = {};
		const format = AUDIO[job.audio];
		for (const s of input.sources) {
			if (!wanted.has(s.id)) continue;
			const bytes = yield* encodeSource(s, dir, format);
			const path = `audio/${s.id}.${format.ext}`;
			entries[path] = [
				new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
				{ level: 0 },
			];
			audio.set(s.id, {
				path,
				durationSeconds: s.durationSeconds,
				sampleRate: s.sampleRate,
				channels: s.channels,
			});
		}
		// The song page's people and address, with the Dawn song's notes as the comment (docs/multitrack-recorder.md "Song metadata in the files").
		const songId = job.songId;
		const meta = songId
			? yield* db.call("dawproject-export:metadata", () =>
					songExportMetadata(job.accountId, songId),
				)
			: null;
		const archive = yield* Effect.try({
			try: () => {
				const { path, ...people } = meta ?? { path: "" };
				const { project, metadata } = dawproject({
					title,
					metadata: {
						...people,
						...(path ? { website: `${SITE_ORIGIN}${path}` } : {}),
						comment: input.notes.trim().slice(0, 2000),
					},
					arrangement: a,
					audio,
					application: { name: "Stem Shovel Dawn", version: __APP_VERSION__ },
				});
				entries["project.xml"] = [strToU8(project), { level: 6 }];
				entries["metadata.xml"] = [strToU8(metadata), { level: 6 }];
				return zipSync(entries);
			},
			catch: (cause) => new DawprojectError({ message: "The project could not be written", cause }),
		});
		const access = yield* db.call("dawproject-export:access", () => accessOfPathname(job.pathname));
		const put = yield* (yield* BlobStore).put(
			job.pathname,
			archive,
			"application/vnd.bitwig.dawproject",
			access,
		);
		const done = yield* db.call("dawproject-export:finish", () =>
			finishDawprojectFile(job.accountId, job.id, {
				url: put.url,
				sizeBytes: archive.byteLength,
				description: descriptionOf(title, input.revision, audio.size, job.audio),
			}),
		);
		const uploadedBy = job.uploadedBy;
		if (uploadedBy && done)
			yield* db.call("dawproject-export:notify", () =>
				notifyDawprojectExport(uploadedBy, job.accountId, {
					title,
					href: `/f/${done.shareCode}`,
				}),
			);
	}).pipe(Effect.scoped, Effect.withSpan("dawproject.build"));
}

/**
 * The export of one file row (see `renderDawprojectExport`). A failure of
 * the build is the user's outcome, not the job's: the row goes and the user
 * hears why, and the job succeeds. Only a failure to record that is thrown.
 */
export function renderDawprojectExportEffect(
	fileId: string,
): Effect.Effect<void, DbError, Services> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const job = yield* db.call("dawproject-export:read", () => dawprojectExportJob(fileId));
		if (!job) return;
		let title = "Dawn song";
		yield* buildExport(job, (t) => {
			title = t;
		}).pipe(
			Effect.catch((e) =>
				Effect.gen(function* () {
					yield* db.call("dawproject-export:fail", () => failFile(job.accountId, job.id));
					const uploadedBy = job.uploadedBy;
					if (uploadedBy)
						yield* db.call("dawproject-export:notify", () =>
							notifyDawprojectExport(uploadedBy, job.accountId, {
								title,
								failed: failureText(e),
							}),
						);
				}),
			),
		);
	}).pipe(Effect.withSpan("dawproject.export", { attributes: { fileId } }));
}

/**
 * A DAWproject of a Dawn song rendered into a song's files, in the jobs
 * function (docs/dawproject-plan.md, phase 2): the file row made by the
 * remote command names the Dawn song and the audio format; this reads the
 * song's newest arrangement and its sources, fetches each source a clip
 * plays, transcodes it with ffmpeg, writes `project.xml` and
 * `metadata.xml` with the same writer the browser's export uses, zips it
 * all (audio stored, text deflated), puts the archive at the row's
 * pathname in the song's store, marks the row ready and tells the user
 * with the file's permanent link. On any failure the row goes and the
 * user hears why. One song at a time; the archive is built in memory, so
 * a long song of many tracks is the jobs function's memory to carry.
 */
export function renderDawprojectExport(fileId: string): Promise<void> {
	return runJob("job.dawproject-export", renderDawprojectExportEffect(fileId));
}
