import { audacityLabels } from "#lib/utils/audacityLabels.js";
import { bextChunk } from "#lib/utils/bext.js";
import { encodeWav } from "#lib/utils/encodeWav.js";
import { encodeWav24 } from "#lib/utils/encodeWav24.js";
import { encodeMp3 } from "./encodeMp3.js";
import { dawproject } from "#lib/utils/dawproject.js";
import { measureLoudness, type LoudnessReading } from "#lib/utils/measureLoudness.js";
import { mixClipsToChannels } from "#lib/utils/mixClipsToChannels.js";
import { normalizationGain } from "#lib/utils/normalizationGain.js";
import { sandProject } from "#lib/utils/sandProject.js";
import { sessionMidi } from "#lib/utils/sessionMidi.js";
import { sessionReadme } from "#lib/utils/sessionReadme.js";
import { zipBlobs, type ZipEntry } from "#lib/utils/zipBlobs.js";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import type { RenderTarget } from "./studio.svelte";

/**
 * An export of a song from Dawn (docs/dawn-daw-plan.md, D3), over any
 * engine that renders a target to a buffer: the mix, a stem per track,
 * a stem per bus, each measured (utils/measureLoudness.ts) and, when
 * asked, brought to the streaming target (utils/normalizationGain.ts),
 * as 24- or 16-bit WAV or as a 192 kbps MP3 (encodeMp3.ts); a DAWproject
 * of the arrangement with the clips' sources (utils/dawproject.ts), always
 * 24-bit WAV inside; a session bundle for the DAWs that read no project
 * format (docs/daw-interop-plan.md): every clip as a Broadcast WAV stamped
 * with its position (utils/bext.ts), a stem per track from zero, the
 * tempo map, meters, keys, markers and MIDI parts as a MIDI file
 * (utils/sessionMidi.ts), Audacity labels and a README; a Sandyne project
 * (utils/sandProject.ts) with its samples beside it. Pure over its
 * engine, so a test hands it a fake; the page downloads what comes back,
 * one by one or zipped (a bundle unzips into the export's zip as a folder).
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
	/** The session bundle for Logic, Pro Tools, Live, Audacity and Reaper (always 24-bit WAV inside). */
	bundle: boolean;
	/** A Sandyne project (`.sand`) with its samples, for the free Sandyne DAW (24-bit WAV beside it). */
	sandyne: boolean;
	/** The audio files' format; `bits` applies to WAV only. */
	format: "wav" | "mp3";
	bits: 16 | 24;
	normalize: boolean;
}

export const EXPORT_DEFAULTS: ExportOptions = {
	mix: true,
	tracks: false,
	buses: false,
	dawproject: false,
	bundle: false,
	sandyne: false,
	format: "wav",
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
	/** A zip's files, for the export's own zip to hold as a folder named `folder` rather than a zip inside a zip. */
	entries?: ZipEntry[];
	folder?: string;
}

const channelsOf = (buffer: AudioBuffer) =>
	Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/** A rendered buffer as a WAV or MP3 file, measured, normalized when asked. */
async function fileOf(
	name: string,
	buffer: AudioBuffer,
	o: Pick<ExportOptions, "format" | "bits" | "normalize">,
): Promise<ExportFile> {
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
		o.format === "mp3"
			? await encodeMp3(channels, buffer.sampleRate)
			: o.bits === 24
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
	const ext = options.format === "mp3" ? "mp3" : "wav";
	const a = engine.arrangement;
	const hasClips = (trackId: string) => a.clips.some((c) => c.trackId === trackId);
	if (options.mix) {
		onprogress?.("Rendering the mix…");
		out.push(await fileOf(`${base}.${ext}`, await engine.render(), options));
	}
	if (options.tracks)
		for (const t of a.tracks) {
			if (!hasClips(t.id)) continue;
			onprogress?.(`Rendering ${t.name}…`);
			out.push(
				await fileOf(
					`${base} - ${fileSafe(t.name)}.${ext}`,
					await engine.render({ track: t.id }),
					options,
				),
			);
		}
	if (options.buses)
		for (const b of a.buses ?? []) {
			onprogress?.(`Rendering ${b.name}…`);
			out.push(
				await fileOf(
					`${base} - ${fileSafe(b.name)}.${ext}`,
					await engine.render({ bus: b.id }),
					options,
				),
			);
		}
	if (options.dawproject) {
		onprogress?.("Writing the DAWproject…");
		const { entries, audio } = sourceFiles(engine, "audio");
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
	if (options.bundle) out.push(await sessionBundle(engine, title, application, onprogress));
	if (options.sandyne) {
		onprogress?.("Writing the Sandyne project…");
		const { entries, audio } = sourceFiles(engine, "samples");
		const text = new TextEncoder();
		entries.unshift({
			name: `${base}.sand`,
			data: text.encode(sandProject({ title, arrangement: a, audio, application })),
			compress: true,
		});
		out.push({
			name: `${base} Sandyne.zip`,
			blob: await zipBlobs(entries),
			entries,
			folder: `${base} Sandyne`,
		});
	}
	return out;
}

/** Every clip's source as a 24-bit WAV under `dir/`, once each, with what the project files need to know of it. */
function sourceFiles(engine: ExportEngine, dir: string) {
	const entries: ZipEntry[] = [];
	const audio = new Map<
		string,
		{ path: string; durationSeconds: number; sampleRate: number; channels: number }
	>();
	for (const c of engine.arrangement.clips) {
		if (!c.sourceId || audio.has(c.sourceId)) continue;
		const buffer = engine.bufferOf(c.sourceId);
		if (!buffer) continue;
		const path = `${dir}/${c.sourceId}.wav`;
		entries.push({ name: path, data: encodeWav24(channelsOf(buffer), buffer.sampleRate) });
		audio.set(c.sourceId, {
			path,
			durationSeconds: buffer.duration,
			sampleRate: buffer.sampleRate,
			channels: buffer.numberOfChannels,
		});
	}
	return { entries, audio };
}

/**
 * The session bundle: `clips/` (each audio clip over [start, start+duration)
 * with its gain and fades, at its source's rate, with a `bext` whose time
 * reference is its start in samples), `stems/` (a track render from zero,
 * stamped at zero), the MIDI file, `labels.txt` and `README.txt`.
 */
async function sessionBundle(
	engine: ExportEngine,
	title: string,
	application: { name: string; version: string },
	onprogress?: (step: string) => void,
): Promise<ExportFile> {
	const a = engine.arrangement;
	const base = fileSafe(title);
	const date = new Date();
	const originator = `${application.name} ${application.version}`;
	const entries: ZipEntry[] = [];
	const nn = (i: number) => String(i + 1).padStart(2, "0");
	const history = (sampleRate: number, channels: number) =>
		`A=PCM,F=${sampleRate},W=24,M=${channels === 1 ? "mono" : "stereo"},T=${originator}`;
	const sourceOf = (id: string) => {
		const b = engine.bufferOf(id);
		return b ? { channels: channelsOf(b), sampleRate: b.sampleRate } : null;
	};
	// Clips, in track order, each stamped with its position.
	const audioClips = a.tracks.flatMap((t) =>
		a.clips
			.filter((c) => c.trackId === t.id && c.sourceId && engine.bufferOf(c.sourceId))
			.sort((x, y) => x.start - y.start)
			.map((c) => ({ track: t, clip: c })),
	);
	const sampleRates: number[] = [];
	audioClips.forEach(({ track, clip }, i) => {
		onprogress?.(`Writing clip ${i + 1} of ${audioClips.length}…`);
		const src = sourceOf(clip.sourceId!)!;
		const mixed = mixClipsToChannels([clip], sourceOf, {
			from: clip.start,
			to: clip.start + clip.duration,
			sampleRate: src.sampleRate,
		});
		const channels = src.channels.length === 1 ? [mixed[0]!] : mixed;
		const loudness = measureLoudness(channels, src.sampleRate);
		sampleRates.push(src.sampleRate);
		const bext = bextChunk({
			description: `${track.name} - ${clip.name}`,
			originator,
			originatorReference: clip.id,
			date,
			timeReference: Math.round(clip.start * src.sampleRate),
			loudness,
			codingHistory: history(src.sampleRate, channels.length),
		});
		entries.push({
			name: `clips/${nn(i)} ${fileSafe(track.name)} - ${fileSafe(clip.name)} @ ${clip.start.toFixed(3)}s.wav`,
			data: encodeWav24(channels, src.sampleRate, [bext]),
		});
	});
	// Stems from zero, through each track's own strip.
	const withClips = a.tracks.filter((t) => a.clips.some((c) => c.trackId === t.id));
	for (const [i, t] of withClips.entries()) {
		onprogress?.(`Rendering ${t.name}…`);
		const buffer = await engine.render({ track: t.id });
		const channels = channelsOf(buffer);
		const bext = bextChunk({
			description: t.name,
			originator,
			originatorReference: t.id,
			date,
			timeReference: 0,
			loudness: measureLoudness(channels, buffer.sampleRate),
			codingHistory: history(buffer.sampleRate, channels.length),
		});
		entries.push({
			name: `stems/${nn(i)} ${fileSafe(t.name)}.wav`,
			data: encodeWav24(channels, buffer.sampleRate, [bext]),
		});
	}
	onprogress?.("Writing the MIDI file and labels…");
	const text = new TextEncoder();
	const midiTracks = a.tracks.filter(
		(t) => t.kind === "midi" && a.clips.some((c) => c.trackId === t.id && c.notes?.length),
	).length;
	entries.unshift(
		{
			name: "README.txt",
			data: text.encode(
				sessionReadme({
					title,
					application,
					date,
					clips: audioClips.length,
					stems: withClips.length,
					midiTracks,
					markers: a.markers?.length ?? 0,
					sampleRates,
				}),
			),
			compress: true,
		},
		{ name: `${base}.mid`, data: sessionMidi(a, title) },
		{ name: "labels.txt", data: text.encode(audacityLabels(a)), compress: true },
	);
	return {
		name: `${base} session.zip`,
		blob: await zipBlobs(entries),
		entries,
		folder: `${base} session`,
	};
}

/** Everything in one zip, named after the song; a file that is itself a zip of entries goes in as a folder. */
export async function bundleExport(title: string, files: ExportFile[]): Promise<ExportFile> {
	return {
		name: `${fileSafe(title)}.zip`,
		blob: await zipBlobs(
			files.flatMap((f) =>
				f.entries && f.folder
					? f.entries.map((e) => ({ ...e, name: `${f.folder}/${e.name}` }))
					: [{ name: f.name, data: f.blob }],
			),
		),
	};
}
