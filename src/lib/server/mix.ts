import { deleteBlobs, mixPathname, putBlob } from "$lib/server/blob";
import { setSongMix, songForMix } from "$lib/server/data";
import { FADER_MAX } from "$lib/audio/engine.svelte";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

/**
 * MP3 mixdowns, rendered server-side with ffmpeg from the playback renditions
 * (the sources when a rendition is missing). Two flavours:
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

const run = promisify(execFile);
const BITRATE = "192k";

export interface MixRequest {
	/** Effective gains; a stem left out is silent. */
	stems: { id: string; gain: number }[];
	master: number;
}

export type Mixable = NonNullable<Awaited<ReturnType<typeof songForMix>>>;

/** Identifies the set of files an original mix is made from. */
export function originalMixKey(song: Mixable) {
	const parts = song.stems.map((s) => `${s.id}:${playbackOrSource(s)}`).sort();
	return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
}

export function originalMixRequest(song: Mixable): MixRequest {
	return { stems: song.stems.map((s) => ({ id: s.id, gain: 1 })), master: 1 };
}

/** True when a custom request is just the original (so the cache can serve it). */
export function isOriginal(song: Mixable, req: MixRequest) {
	return (
		req.master === 1 &&
		req.stems.length === song.stems.length &&
		req.stems.every((s) => s.gain === 1 && song.stems.some((t) => t.id === s.id))
	);
}

/** Parses `?stems=id:gain,id:gain&master=m` against the song; null when malformed. */
export function parseMixRequest(song: Mixable, params: URLSearchParams): MixRequest | null {
	const stemsParam = params.get("stems");
	const masterParam = params.get("master") ?? "1";
	if (stemsParam === null) return originalMixRequest(song);
	const master = Number(masterParam);
	if (!Number.isFinite(master) || master < 0 || master > 1) return null;
	const stems: MixRequest["stems"] = [];
	for (const part of stemsParam.split(",").filter(Boolean)) {
		const [id, g = "1"] = part.split(":");
		const gain = Number(g);
		if (!song.stems.some((s) => s.id === id)) return null;
		if (!Number.isFinite(gain) || gain <= 0 || gain > FADER_MAX) return null;
		if (stems.some((s) => s.id === id)) return null;
		stems.push({ id, gain: Math.round(gain * 1000) / 1000 });
	}
	if (stems.length === 0) return null;
	return { stems, master: Math.round(master * 1000) / 1000 };
}

function playbackOrSource(s: Mixable["stems"][number]) {
	return s.playbackStatus === "ready" && s.playbackUrl ? s.playbackUrl : s.url;
}

/** Renders the request to an MP3 and returns its bytes. */
export async function renderMix(song: Mixable, req: MixRequest): Promise<Buffer> {
	if (!ffmpegPath) throw new Error("ffmpeg binary is not available on this platform");
	const inputs = req.stems.map((r) => {
		const stem = song.stems.find((s) => s.id === r.id);
		if (!stem) throw new Error(`stem ${r.id} is not in this song`);
		return { url: playbackOrSource(stem), gain: r.gain };
	});
	const dir = await mkdtemp(join(tmpdir(), "mix-"));
	try {
		const files = await Promise.all(
			inputs.map(async ({ url }, i) => {
				const file = join(dir, `in-${i}`);
				const res = await fetch(url);
				if (!res.ok || !res.body)
					throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
				await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
				return file;
			}),
		);
		const chains = inputs.map(
			({ gain }, i) =>
				`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${gain}[a${i}]`,
		);
		const sum = inputs.map((_, i) => `[a${i}]`).join("");
		const filter = [
			...chains,
			`${sum}amix=inputs=${inputs.length}:normalize=0:dropout_transition=0,volume=${req.master},alimiter=limit=0.98[out]`,
		].join(";");
		const output = join(dir, "mix.mp3");
		await run(
			ffmpegPath,
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
		);
		return await readFile(output);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** The original mix from the cache, rendering and caching it when the stems changed. */
export async function originalMix(song: Mixable, accountId: string): Promise<Buffer> {
	const key = originalMixKey(song);
	if (song.mixUrl && song.mixKey === key) {
		const res = await fetch(song.mixUrl);
		if (res.ok) return Buffer.from(await res.arrayBuffer());
	}
	const bytes = await renderMix(song, originalMixRequest(song));
	const blob = await putBlob(mixPathname(accountId, song.id, key), bytes, "audio/mpeg");
	await setSongMix(song.id, { url: blob.url, key });
	if (song.mixUrl && song.mixUrl !== blob.url) await deleteBlobs([song.mixUrl]);
	return bytes;
}
