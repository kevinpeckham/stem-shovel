import { STUDIO_FADER_MAX, MAX_STUDIO_TRACKS } from "#lib/constants/studio.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import type { StudioArrangement, StudioSourceView } from "#lib/val/StudioSchema.js";
import { nanoid } from "nanoid";
import { songChangesToStudio } from "./studioChanges.js";

/** A stem as the player's manifest lists it (audio/types.ts, StemSource): the rendition's URL the browser may fetch, and what is known of it. */
export interface ManifestStem {
	id: string;
	label: string;
	url: string;
	duration?: number;
	channels?: number;
	peaks?: number[];
	gain?: number;
	pan?: number;
	tint?: string;
}

/**
 * A Dawn song straight from a song's stems, nothing copied and nothing
 * saved (docs/multitrack-recorder.md, "The home demo"): a track and a clip
 * per stem, the stems' renditions as the sources the engine fetches, and
 * the song's tempo, meter and key as the arrangement's (utils/studioChanges.ts).
 * The home page's Dawn demo when no admin chose a Dawn song; null without
 * a playable stem.
 */
export function studioFromStems(song: {
	title: string;
	changes: SongChange[];
	stems: ManifestStem[];
}): {
	title: string;
	current: StudioArrangement;
	sources: StudioSourceView[];
	/** Stems past the track cap, left behind (docs/multitrack-recorder.md "Caps"). */
	left: number;
} | null {
	const withUrl = song.stems.filter((st) => st.url);
	const stems = withUrl.slice(0, MAX_STUDIO_TRACKS);
	if (stems.length === 0) return null;
	const tracks: StudioArrangement["tracks"] = [];
	const clips: StudioArrangement["clips"] = [];
	const sources: StudioSourceView[] = [];
	for (const st of stems) {
		const trackId = nanoid();
		const sourceId = nanoid();
		tracks.push({
			id: trackId,
			kind: "audio",
			name: st.label,
			colour: st.tint,
			gain: Math.min(Math.max(st.gain ?? 1, 0), STUDIO_FADER_MAX),
			pan: Math.min(Math.max(st.pan ?? 0, -1), 1),
			muted: false,
			solo: false,
			armed: false,
			input: null,
		});
		clips.push({
			id: nanoid(),
			trackId,
			sourceId,
			start: 0,
			offset: 0,
			duration: Math.max(0.001, st.duration ?? 0.001),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: st.label,
		});
		sources.push({
			id: sourceId,
			kind: "import",
			takeNumber: 0,
			trackLabel: st.label,
			url: st.url,
			filename: `${st.label}.m4a`,
			codec: "aac",
			sampleRate: 48000,
			channels: st.channels === 1 ? 1 : 2,
			durationSeconds: st.duration ?? 0,
			sizeBytes: 0,
			peaks: st.peaks ?? [],
			createdAt: new Date(0),
		});
	}
	return {
		title: song.title,
		left: withUrl.length - stems.length,
		current: {
			version: 1,
			...songChangesToStudio(song.changes),
			gridOn: true,
			countIn: false,
			click: false,
			loop: null,
			master: 1,
			tracks,
			clips,
		},
		sources,
	};
}
