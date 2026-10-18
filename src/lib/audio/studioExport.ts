import { encodeWav } from "#lib/utils/encodeWav.js";
import { encodeWav24 } from "#lib/utils/encodeWav24.js";
import { dawproject } from "#lib/utils/dawproject.js";
import { measureLoudness, type LoudnessReading } from "#lib/utils/measureLoudness.js";
import { normalizationGain } from "#lib/utils/normalizationGain.js";
import { zipBlobs, type ZipEntry } from "#lib/utils/zipBlobs.js";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import type { RenderTarget } from "./studio.svelte";

/**
 * An export of a song from Dawn (docs/dawn-daw-plan.md, D3), over any
 * engine that renders a target to a buffer: the mix, a stem per track,
 * a stem per bus, each measured (utils/measureLoudness.ts) and, when
 * asked, brought to the streaming target (utils/normalizationGain.ts),
 * as 24- or 16-bit WAV; a DAWproject of the arrangement with the clips'
 * sources (utils/dawproject.ts). Pure over its engine, so a test hands
 * it a fake; the page downloads what comes back, one by one or zipped.
 */
export interface ExportEngine {
	arrangement: StudioArrangement;
	render(target?: RenderTarget): Promise<AudioBuffer>;
	bufferOf(sourceId: string): AudioBuffer | null;
}

export interface ExportOptions {
	mix: boolean;
	tracks: boolean;
	buses: boolean;
	dawproject: boolean;
	bits: 16 | 24;
	normalize: boolean;
}

export const EXPORT_DEFAULTS: ExportOptions = {
	mix: true,
	tracks: false,
	buses: false,
	dawproject: false,
	bits: 24,
	normalize: false,
};

export interface ExportFile {
	name: string;
	blob: Blob;
	/** What the audio measured before any normalization; a DAWproject has none. */
	loudness?: LoudnessReading;
	/** The gain applied, in dB (0 when not normalized). */
	gainDb?: number;
}

const channelsOf = (buffer: AudioBuffer) =>
	Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/** A rendered buffer as a WAV file, measured, normalized when asked. */
function fileOf(
	name: string,
	buffer: AudioBuffer,
	o: Pick<ExportOptions, "bits" | "normalize">,
): ExportFile {
	let channels = channelsOf(buffer);
	const loudness = measureLoudness(channels, buffer.sampleRate);
	let gain = 1;
	if (o.normalize) {
		gain = normalizationGain(loudness);
		if (gain !== 1)
			channels = channels.map((ch) => {
				const out = new Float32Array(ch.length);
				for (let i = 0; i < ch.length; i++) out[i] = ch[i]! * gain;
				return out;
			});
	}
	const blob =
		o.bits === 24
			? new Blob([encodeWav24(channels, buffer.sampleRate)], { type: "audio/wav" })
			: encodeWav(channels, buffer.sampleRate);
	return { name, blob, loudness, gainDb: Math.round(20 * Math.log10(gain) * 10) / 10 };
}

/** A name safe as a file name: no path separators or the characters a filesystem refuses. */
export const fileSafe = (s: string) =>
	s
		.replace(/[\\/:*?"<>|]+/g, "-")
		.replace(/\s+/g, " ")
		.trim() || "untitled";

export async function exportSong(
	engine: ExportEngine,
	title: string,
	options: ExportOptions,
	application: { name: string; version: string },
	onprogress?: (step: string) => void,
): Promise<ExportFile[]> {
	const out: ExportFile[] = [];
	const base = fileSafe(title);
	const a = engine.arrangement;
	const hasClips = (trackId: string) => a.clips.some((c) => c.trackId === trackId);
	if (options.mix) {
		onprogress?.("Rendering the mix…");
		out.push(fileOf(`${base}.wav`, await engine.render(), options));
	}
	if (options.tracks)
		for (const t of a.tracks) {
			if (!hasClips(t.id)) continue;
			onprogress?.(`Rendering ${t.name}…`);
			out.push(
				fileOf(`${base} - ${fileSafe(t.name)}.wav`, await engine.render({ track: t.id }), options),
			);
		}
	if (options.buses)
		for (const b of a.buses ?? []) {
			onprogress?.(`Rendering ${b.name}…`);
			out.push(
				fileOf(`${base} - ${fileSafe(b.name)}.wav`, await engine.render({ bus: b.id }), options),
			);
		}
	if (options.dawproject) {
		onprogress?.("Writing the DAWproject…");
		const entries: ZipEntry[] = [];
		const audio = new Map<
			string,
			{ path: string; durationSeconds: number; sampleRate: number; channels: number }
		>();
		for (const c of a.clips) {
			if (!c.sourceId || audio.has(c.sourceId)) continue;
			const buffer = engine.bufferOf(c.sourceId);
			if (!buffer) continue;
			const path = `audio/${c.sourceId}.wav`;
			entries.push({ name: path, data: encodeWav24(channelsOf(buffer), buffer.sampleRate) });
			audio.set(c.sourceId, {
				path,
				durationSeconds: buffer.duration,
				sampleRate: buffer.sampleRate,
				channels: buffer.numberOfChannels,
			});
		}
		const { project, metadata } = dawproject({ title, arrangement: a, audio, application });
		const text = new TextEncoder();
		entries.unshift(
			{ name: "project.xml", data: text.encode(project), compress: true },
			{ name: "metadata.xml", data: text.encode(metadata), compress: true },
		);
		out.push({
			name: `${base}.dawproject`,
			blob: await zipBlobs(entries, "application/vnd.bitwig.dawproject"),
		});
	}
	return out;
}

/** Everything in one zip, named after the song. */
export async function bundleExport(title: string, files: ExportFile[]): Promise<ExportFile> {
	return {
		name: `${fileSafe(title)}.zip`,
		blob: await zipBlobs(files.map((f) => ({ name: f.name, data: f.blob }))),
	};
}
