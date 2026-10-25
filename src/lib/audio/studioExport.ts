import { audacityLabels } from "#lib/utils/audacityLabels.js";
import { clipSegments } from "#lib/utils/clipSegments.js";
import { bextChunk } from "#lib/utils/bext.js";
import { encodeWav } from "#lib/utils/encodeWav.js";
import { encodeWav24 } from "#lib/utils/encodeWav24.js";
import { encodeMp3 } from "./encodeMp3.js";
import { dawproject } from "#lib/utils/dawproject.js";
import { measureLoudness, type LoudnessReading } from "#lib/utils/measureLoudness.js";
import { mixClipsToChannels } from "#lib/utils/mixClipsToChannels.js";
import { normalizationGain } from "#lib/utils/normalizationGain.js";
import { rppProject } from "#lib/utils/rpp.js";
import { sandProject } from "#lib/utils/sandProject.js";
import { sessionMidi } from "#lib/utils/sessionMidi.js";
import { sessionReadme } from "#lib/utils/sessionReadme.js";
import { songSampleRate } from "#lib/utils/songSampleRate.js";
import { zipBlobs, type ZipEntry } from "#lib/utils/zipBlobs.js";
import type { StudioArrangement, StudioClip } from "#lib/val/StudioSchema.js";
import type { RenderTarget } from "./studio.svelte";
import type { DawprojectMetadata } from "#lib/val/DawprojectMetadataSchema.js";

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
	/** Every source decoded and held: a source playing from this device's copy has no buffer until then (docs/multitrack-recorder.md "Scale and structure"). */
	ensureDecoded?(): Promise<void>;
	/** A warped clip's content as it plays (docs/multitrack-recorder.md "Warping a clip"); the source itself when absent. */
	clipBufferOf?(clip: StudioClip): AudioBuffer | null;
	/** Whether a track can be rendered at all (an engine with no instrument says no to a MIDI track); every track when absent. */
	renders?(trackId: string): boolean;
	/**
	 * A source's buffer at the song's rate when it was decoded at another (the browser's resampler,
	 * audio/resampleBuffer.ts); without it the project files and the bundle's clips keep the source's rate.
	 */
	resample?(buffer: AudioBuffer, sampleRate: number): Promise<AudioBuffer>;
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
	/** A Reaper project (`.rpp`) with its media beside it (utils/rpp.ts). */
	reaper?: boolean;
	/** The audio files' format; `bits` applies to WAV only (the project files' audio is always WAV, at `bits`). */
	format: "wav" | "mp3";
	bits: 16 | 24;
	normalize: boolean;
	/**
	 * The project files' audio trimmed to what plays: one file per clip over [offset, offset + duration)
	 * and the clip from its start, so nothing a clip skips travels (the converter's repack; docs/dawproject-plan.md).
	 */
	trim?: boolean;
}

export const EXPORT_DEFAULTS: ExportOptions = {
	mix: true,
	tracks: false,
	buses: false,
	dawproject: false,
	bundle: false,
	sandyne: false,
	reaper: false,
	format: "wav",
	bits: 24,
	trim: false,
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
	/** The DAWproject's metadata besides the title (the song's notes as its comment; docs/multitrack-recorder.md "Song metadata in the files"). */
	metadata?: DawprojectMetadata,
): Promise<ExportFile[]> {
	const out: ExportFile[] = [];
	const base = fileSafe(title);
	const ext = options.format === "mp3" ? "mp3" : "wav";
	await engine.ensureDecoded?.();
	const a = engine.arrangement;
	const hasClips = (trackId: string) => a.clips.some((c) => c.trackId === trackId);
	if (options.mix) {
		onprogress?.("Rendering the mix…");
		out.push(await fileOf(`${base}.${ext}`, await engine.render(), options));
	}
	if (options.tracks)
		for (const t of a.tracks) {
			if (!hasClips(t.id) || engine.renders?.(t.id) === false) continue;
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
		const { entries, audio, arrangement } = await sourceFiles(engine, "audio", options);
		const written = dawproject({ title, metadata, arrangement, audio, application });
		const text = new TextEncoder();
		entries.unshift(
			{ name: "project.xml", data: text.encode(written.project), compress: true },
			{ name: "metadata.xml", data: text.encode(written.metadata), compress: true },
		);
		out.push({
			name: `${base}.dawproject`,
			blob: await zipBlobs(entries, "application/vnd.bitwig.dawproject"),
		});
	}
	if (options.bundle) out.push(await sessionBundle(engine, title, application, onprogress));
	if (options.sandyne) {
		onprogress?.("Writing the Sandyne project…");
		const { entries, audio, arrangement } = await sourceFiles(engine, "samples", options);
		const text = new TextEncoder();
		entries.unshift({
			name: `${base}.sand`,
			data: text.encode(sandProject({ title, arrangement, audio, application })),
			compress: true,
		});
		out.push({
			name: `${base} Sandyne.zip`,
			blob: await zipBlobs(entries),
			entries,
			folder: `${base} Sandyne`,
		});
	}
	if (options.reaper) {
		onprogress?.("Writing the Reaper project…");
		const { entries, audio, arrangement } = await sourceFiles(engine, "media", options);
		const text = new TextEncoder();
		entries.unshift({
			name: `${base}.rpp`,
			data: text.encode(rppProject({ title, arrangement, audio, application })),
			compress: true,
		});
		out.push({
			name: `${base} Reaper.zip`,
			blob: await zipBlobs(entries),
			entries,
			folder: `${base} Reaper`,
		});
	}
	return out;
}

/** A clip source's buffer at the song's rate where the engine can resample; as decoded otherwise. */
async function sourceAtSongRate(
	engine: ExportEngine,
	sourceId: string,
): Promise<AudioBuffer | null> {
	return atSongRate(engine, engine.bufferOf(sourceId));
}
/** What a clip plays at the song's rate: a warped clip's rendering (the engine's, when it has one), else its source. */
async function clipAtSongRate(engine: ExportEngine, clip: StudioClip): Promise<AudioBuffer | null> {
	if (!clip.sourceId) return null;
	const buffer =
		clip.warp && engine.clipBufferOf ? engine.clipBufferOf(clip) : engine.bufferOf(clip.sourceId);
	return atSongRate(engine, buffer);
}
async function atSongRate(engine: ExportEngine, buffer: AudioBuffer | null) {
	const rate = songSampleRate(engine.arrangement);
	if (!buffer || buffer.sampleRate === rate || !engine.resample) return buffer;
	return engine.resample(buffer, rate);
}

/**
 * The audio the project files carry, as WAV at `options.bits` under `dir/`, at
 * the song's rate, with what the project files need to know of it, and the
 * arrangement to write: every clip's source once each, as it is; or, with
 * `options.trim`, one file per clip holding only what the clip plays, and
 * the clips rewritten to play those from zero (the repack's trim).
 */
async function sourceFiles(
	engine: ExportEngine,
	dir: string,
	options: Pick<ExportOptions, "bits" | "trim">,
) {
	const entries: ZipEntry[] = [];
	const audio = new Map<
		string,
		{ path: string; durationSeconds: number; sampleRate: number; channels: number }
	>();
	const encode = (channels: Float32Array[], sampleRate: number) =>
		options.bits === 16 ? encodeWav(channels, sampleRate) : encodeWav24(channels, sampleRate);
	const a = engine.arrangement;
	if (!options.trim) {
		// Every source a clip can play: the chosen one and its takes (docs/multitrack-recorder.md "Takes in the files").
		for (const c of a.clips) {
			if (!c.sourceId) continue;
			for (const sourceId of [c.sourceId, ...(c.alternates ?? [])]) {
				if (audio.has(sourceId)) continue;
				const buffer = await sourceAtSongRate(engine, sourceId);
				if (!buffer) continue;
				const path = `${dir}/${sourceId}.wav`;
				entries.push({ name: path, data: encode(channelsOf(buffer), buffer.sampleRate) });
				audio.set(sourceId, {
					path,
					durationSeconds: buffer.duration,
					sampleRate: buffer.sampleRate,
					channels: buffer.numberOfChannels,
				});
			}
		}
		return { entries, audio, arrangement: a };
	}
	const clips: StudioArrangement["clips"] = [];
	for (const c of a.clips) {
		// A warped clip's file is its warped content, so the trimmed clip needs no warp of its own.
		const buffer = c.sourceId ? await clipAtSongRate(engine, c) : null;
		if (!buffer) {
			clips.push(c);
			continue;
		}
		const sr = buffer.sampleRate;
		// What the clip plays, pass by pass for a looped clip (utils/clipSegments.ts), laid end to end as one file.
		const spans = clipSegments(c)
			.map((seg) => {
				const from = Math.min(buffer.length, Math.max(0, Math.round(seg.offset * sr)));
				const to = Math.min(
					buffer.length,
					Math.max(from + 1, Math.round((seg.offset + seg.duration) * sr)),
				);
				return { from, to };
			})
			.filter((x) => x.to > x.from);
		const total = spans.reduce((n, x) => n + (x.to - x.from), 0);
		const channels = channelsOf(buffer).map((ch) => {
			const out = new Float32Array(total);
			let at = 0;
			for (const x of spans) {
				out.set(ch.subarray(x.from, x.to), at);
				at += x.to - x.from;
			}
			return out;
		});
		const path = `${dir}/${c.id}.wav`;
		entries.push({ name: path, data: encode(channels, sr) });
		audio.set(c.id, {
			path,
			durationSeconds: total / sr,
			sampleRate: sr,
			channels: channels.length,
		});
		// Trimmed to what the clip plays, so its loop, warp and other takes are gone with the rest of the file.
		const { loop: _loop, warp: _warp, alternates: _alternates, ...rest } = c;
		clips.push({ ...rest, sourceId: c.id, offset: 0 });
	}
	return { entries, audio, arrangement: { ...a, clips } };
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
	// The sources at the song's rate (one Broadcast WAV per clip, every clip at the one rate a DAW session wants).
	const buffers = new Map<string, AudioBuffer>();
	// A warped clip's file is its warped content, kept under the clip's own id.
	const keyOf = (c: StudioClip) => (c.warp ? c.id : c.sourceId!);
	for (const c of a.clips) {
		if (!c.sourceId || buffers.has(keyOf(c))) continue;
		const b = await clipAtSongRate(engine, c);
		if (b) buffers.set(keyOf(c), b);
	}
	const sourceOf = (id: string, clip?: StudioClip) => {
		const b = buffers.get(clip ? keyOf(clip) : id);
		return b ? { channels: channelsOf(b), sampleRate: b.sampleRate } : null;
	};
	// Clips, in track order, each stamped with its position.
	const audioClips = a.tracks.flatMap((t) =>
		a.clips
			.filter((c) => c.trackId === t.id && c.sourceId && !c.muted && buffers.has(keyOf(c)))
			.sort((x, y) => x.start - y.start)
			.map((c) => ({ track: t, clip: c })),
	);
	const sampleRates: number[] = [];
	audioClips.forEach(({ track, clip }, i) => {
		onprogress?.(`Writing clip ${i + 1} of ${audioClips.length}…`);
		const src = sourceOf(clip.sourceId!, clip)!;
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
	const withClips = a.tracks.filter(
		(t) => a.clips.some((c) => c.trackId === t.id) && engine.renders?.(t.id) !== false,
	);
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
