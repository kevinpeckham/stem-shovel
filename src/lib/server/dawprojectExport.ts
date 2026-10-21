import { putBlob, readBlob } from "#lib/server/blob.js";
import {
	dawprojectExportJob,
	failFile,
	finishDawprojectFile,
	studioExportInput,
	type DawprojectAudio,
} from "#lib/server/data.js";
import { notifyDawprojectExport } from "#lib/server/notifications.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { dawproject, type DawprojectAudio as DawprojectAudioFile } from "#lib/utils/dawproject.js";
import ffmpegPath from "ffmpeg-static";
import { strToU8, zipSync, type Zippable } from "fflate";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The audio inside the archive: FLAC by default (lossless, half the bytes), or WAV at 24 or 16 bits. */
const AUDIO: Record<DawprojectAudio, { ext: string; args: string[]; type: string }> = {
	flac: { ext: "flac", args: ["-c:a", "flac", "-compression_level", "5"], type: "audio/flac" },
	wav24: { ext: "wav", args: ["-c:a", "pcm_s24le"], type: "audio/wav" },
	wav16: { ext: "wav", args: ["-c:a", "pcm_s16le"], type: "audio/wav" },
};

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
export async function renderDawprojectExport(fileId: string): Promise<void> {
	const job = await dawprojectExportJob(fileId);
	if (!job) return;
	const ffmpeg = ffmpegPath;
	if (!ffmpeg) {
		await failFile(job.accountId, job.id);
		if (job.uploadedBy)
			await notifyDawprojectExport(job.uploadedBy, job.accountId, {
				title: "Dawn song",
				failed: "The audio tools are not available here.",
			});
		return;
	}
	const dir = await mkdtemp(join(tmpdir(), "dawproject-"));
	let title = "Dawn song";
	try {
		const input = await studioExportInput(job.accountId, job.ideaId);
		if (!input) throw new Error("The Dawn song is gone");
		title = input.title;
		if (!input.arrangement) throw new Error("The Dawn song has nothing saved yet");
		const a = input.arrangement;
		const wanted = new Set(a.clips.map((c) => c.sourceId).filter((id): id is string => !!id));
		const audio = new Map<string, DawprojectAudioFile>();
		const entries: Zippable = {};
		const format = AUDIO[job.audio];
		for (const s of input.sources) {
			if (!wanted.has(s.id)) continue;
			const source = join(dir, `${s.id}.src`);
			const res = await readBlob(s.url);
			if (!res.ok || !res.body) throw new Error(`${res.status} fetching ${s.filename}`);
			await pipeline(Readable.fromWeb(res.body as never), createWriteStream(source));
			const out = join(dir, `${s.id}.${format.ext}`);
			await run(
				ffmpeg,
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
				{ maxBuffer: 1024 * 1024 },
			);
			const bytes = await readFile(out);
			await rm(source, { force: true });
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
		const { project, metadata } = dawproject({
			title,
			arrangement: a,
			audio,
			application: { name: "Stem Shovel Dawn", version: __APP_VERSION__ },
		});
		entries["project.xml"] = [strToU8(project), { level: 6 }];
		entries["metadata.xml"] = [strToU8(metadata), { level: 6 }];
		const archive = zipSync(entries);
		const access = await accessOfPathname(job.pathname);
		const put = await putBlob(
			job.pathname,
			Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength),
			"application/vnd.bitwig.dawproject",
			access,
		);
		const label =
			job.audio === "flac" ? "FLAC" : job.audio === "wav24" ? "24-bit WAV" : "16-bit WAV";
		const done = await finishDawprojectFile(job.accountId, job.id, {
			url: put.url,
			sizeBytes: archive.byteLength,
			description: `A DAWproject of the Dawn song “${title}” (revision ${input.revision}), ${audio.size} ${audio.size === 1 ? "recording" : "recordings"} as ${label}. Opens in Bitwig Studio, Studio One, Cubase, Nuendo and Dawn.`,
		});
		if (job.uploadedBy && done)
			await notifyDawprojectExport(job.uploadedBy, job.accountId, {
				title,
				href: `/f/${done.shareCode}`,
			});
	} catch (e) {
		await failFile(job.accountId, job.id);
		if (job.uploadedBy)
			await notifyDawprojectExport(job.uploadedBy, job.accountId, {
				title,
				failed: e instanceof Error ? e.message : String(e),
			});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
