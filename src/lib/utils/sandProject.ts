import { stemTintHex } from "#lib/constants/stemTints.js";
import type { StudioArrangement, StudioClip } from "#lib/val/StudioSchema.js";
import { clipNoteEvents } from "./clipNoteEvents";
import { clipSegments } from "./clipSegments";
import { keySignatureOf } from "./keySignatureOf";

/** An audio file the project refers to for a clip's source: its path beside the `.sand` file. */
export interface SandAudio {
	path: string;
	durationSeconds: number;
	sampleRate: number;
	channels: number;
}

export interface SandProjectInput {
	title: string;
	arrangement: StudioArrangement;
	/** By source id: the audio written beside the project (a clip whose source is missing is left out). */
	audio: Map<string, SandAudio>;
	application: { name: string; version: string };
}

/**
 * A song as a Sandyne project (`.sand`, the free DAW's own file, plain
 * JSON; docs/daw-interop-plan.md, "Sandyne"): one tempo and meter, the
 * master level, the key as the project's scale, a sample track per audio
 * track and a synth track per MIDI track with level, pan, mute, solo and
 * color, and the clips as contents in beats: a sample clip over its file
 * from its offset with its gain and fades, a notes clip's notes with
 * velocity 0..127. Sandyne has one tempo, so beats come from the song's
 * first tempo alone (a song with tempo changes keeps its seconds, not
 * its bars). Buses, sends, inserts, automation and markers have no place
 * in the file and are left out. The shape was read from Sandyne 2.5's own
 * files and proved with its headless `inspect` and `rendertracks`
 * (scripts/interop/sandyne.mjs). Pure; the caller writes the audio.
 */
export function sandProject(input: SandProjectInput): string {
	const a = input.arrangement;
	const beats = (seconds: number) => round(seconds * a.bpm) / 60;
	const tracks: Record<string, unknown>[] = [];
	const contents: Record<string, unknown>[] = [];
	let nextContentId = 1;
	for (const t of a.tracks) {
		const trackIndex = tracks.length;
		const contentIds: number[] = [];
		for (const c of a.clips.filter((c) => c.trackId === t.id).sort((x, y) => x.start - y.start)) {
			for (const content of contentsOf(c, beats, input.audio)) {
				const id = nextContentId++;
				contentIds.push(id);
				contents.push({ id, trackIndex, ...content });
			}
		}
		tracks.push(trackOf(t, trackIndex, contentIds));
	}
	const project = {
		version: 1,
		appVersion: "2.5.0.0",
		projectTitle: input.title,
		comment: `Exported from ${input.application.name} ${input.application.version}`,
		global: globalOf(a),
		nextTrackId: tracks.length + 1,
		nextContentId,
		tracks,
		contents,
	};
	return JSON.stringify(project, null, "\t") + "\n";
}

/** The project's globals: one tempo and meter, the master level, the key as a scale when it is one. */
function globalOf(a: StudioArrangement) {
	const scale = scaleOf(a.key ?? "");
	return {
		bpm: a.bpm,
		beatsPerBar: a.beatsPerBar,
		beatUnit: 4,
		masterVolume: a.master,
		masterPan: 0,
		...(scale ? { scaleRoot: scale.root, scaleType: scale.minor ? 1 : 0 } : {}),
	};
}

/** A clip as Sandyne contents: one, or one per pass of a looped clip (Sandyne has no clip loop); none for an audio clip whose sample is missing. */
function contentsOf(
	c: StudioClip,
	beats: (seconds: number) => number,
	audio: Map<string, SandAudio>,
) {
	const passes = c.loop
		? clipSegments(c).map((seg, i, all) => ({
				...c,
				loop: undefined,
				start: seg.start,
				offset: seg.offset,
				duration: seg.duration,
				fadeIn: i === 0 ? c.fadeIn : 0,
				fadeOut: i === all.length - 1 ? c.fadeOut : 0,
			}))
		: [c];
	return passes
		.map((pass) =>
			pass.notes
				? notesContent(pass, beats)
				: sampleContent(pass, beats, pass.sourceId ? audio.get(pass.sourceId) : undefined),
		)
		.filter((x) => x !== null);
}

/** A track as Sandyne's: a sample track, or a synth track for a MIDI track, with its strip and color. */
function trackOf(t: StudioArrangement["tracks"][number], index: number, contentIds: number[]) {
	const midi = t.kind === "midi";
	return {
		trackId: index + 1,
		index,
		type: midi ? 0 : 1,
		name: t.name,
		volume: t.gain,
		pan: t.pan,
		mute: t.muted,
		solo: t.solo,
		color: (stemTintHex(t.colour) ?? "#4A90D9").replace(/^#/, "").toUpperCase(),
		...(midi ? { internalInstrumentId: "synth" } : {}),
		contentIds,
	};
}

/** A notes clip as a Sandyne content: its notes relative to the clip in beats, velocity 1..127. */
function notesContent(c: StudioClip, beats: (seconds: number) => number) {
	const notesData = clipNoteEvents({ ...c, gain: 1 }).map((n) => ({
		note: n.pitch,
		velocity: Math.max(1, Math.min(127, Math.round(n.velocity * 127))),
		start: beats(n.at - c.start),
		duration: Math.max(0.01, beats(n.duration)),
	}));
	return {
		type: 0,
		name: c.name,
		startBeat: beats(c.start),
		lengthBeats: beats(c.duration),
		contentStartOffset: 0,
		notesData,
	};
}

/** An audio clip as a Sandyne content over its sample file; nothing when the sample is missing. */
function sampleContent(c: StudioClip, beats: (seconds: number) => number, audio?: SandAudio) {
	if (!audio) return null;
	return {
		type: 1,
		name: c.name,
		startBeat: beats(c.start),
		lengthBeats: beats(c.duration),
		contentStartOffset: beats(c.offset),
		sampleFilePath: audio.path,
		sampleRate: audio.sampleRate,
		sampleLengthSeconds: audio.durationSeconds,
		sampleGain: c.gain,
		fadeInBeats: beats(c.fadeIn),
		fadeOutBeats: beats(c.fadeOut),
	};
}

const round = (x: number) => Math.round(x * 1_000_000) / 1_000_000;

/** The key's root as a pitch class (0 = C) and whether it is minor, from its signature; null when the text is no key. */
function scaleOf(key: string): { root: number; minor: boolean } | null {
	const sig = keySignatureOf(key);
	if (!sig) return null;
	// Each sharp moves the root a fifth up; a minor key's root sits three semitones under its relative major's.
	return { root: (((sig.sharps * 7 + (sig.minor ? 9 : 0)) % 12) + 12) % 12, minor: sig.minor };
}
