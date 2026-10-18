import type { StemEngine } from "#lib/audio/engine.svelte.js";
import type { studio } from "#lib/audio/studio.svelte.js";
import type { MeterState } from "#lib/utils/meterLevel.js";
import { loudnessFromPeaks, relativeLoudness } from "#lib/utils/stemLoudness.js";

/**
 * What the Stage drives (docs/visual-mixer.md): one shape over the stem
 * player's engine and Dawn's, so `MixerStage.svelte` is written once. The
 * adapters below read the engines' reactive fields through getters, so a
 * template reading `model.tracks` follows the engine as the rows do.
 */
export interface MixerTrack {
	id: string;
	/** 1-based, the row's number. */
	number: number;
	label: string;
	/** A tint id (constants/stemTints.ts) or null for the player's blue. */
	tint: string | null;
	gain: number;
	pan: number;
	muted: boolean;
	soloed: boolean;
	/** A mono track pans as a position (unity both sides at center); a stereo one as a balance. */
	mono: boolean;
	/** The track's own loudness relative to the loudest, dB ≤ 0 (0 when unknown). */
	loudness: number;
}

export interface MixerModel {
	readonly tracks: MixerTrack[];
	readonly master: number;
	readonly anySolo: boolean;
	readonly levels: Record<string, MeterState>;
	readonly masterLevel: MeterState;
	setGain(id: string, value: number): void;
	setPan(id: string, value: number): void;
	toggleMute(id: string): void;
	toggleSolo(id: string): void;
	setMaster(value: number): void;
	resetClips(id?: string): void;
	/** Undo for mix moves, when the engine keeps one the Stage should offer (Dawn's page has its own buttons and keys). */
	readonly undo?: {
		readonly canUndo: boolean;
		readonly canRedo: boolean;
		undo(): void;
		redo(): void;
	};
}

/** The stem player's engine as a mixer model; each stem's loudness from its stored peaks, relative to the loudest. */
export function stemMixerModel(engine: StemEngine): MixerModel {
	// The loudness of a peaks array never changes; the relative figures do when a stem arrives or goes.
	const absolute = new WeakMap<number[], number | null>();
	const loudnessOf = (peaks: number[]): number | null => {
		let v = absolute.get(peaks);
		if (v === undefined) {
			v = loudnessFromPeaks(peaks);
			absolute.set(peaks, v);
		}
		return v;
	};
	return {
		get tracks() {
			const rel = relativeLoudness(new Map(engine.stems.map((s) => [s.id, loudnessOf(s.peaks)])));
			return engine.stems.map((s, i) => ({
				id: s.id,
				number: i + 1,
				label: s.label,
				tint: s.tint,
				gain: s.gain,
				pan: s.pan,
				muted: s.muted,
				soloed: s.soloed,
				mono: s.channels === 1,
				loudness: rel.get(s.id) ?? 0,
			}));
		},
		get master() {
			return engine.master;
		},
		get anySolo() {
			return engine.anySolo;
		},
		get levels() {
			return engine.levels;
		},
		get masterLevel() {
			return engine.masterLevel;
		},
		setGain: (id, v) => engine.setGain(id, v),
		setPan: (id, v) => engine.setPan(id, v),
		toggleMute: (id) => engine.toggleMute(id),
		toggleSolo: (id) => engine.toggleSolo(id),
		setMaster: (v) => engine.setMaster(v),
		resetClips: (id) => engine.resetClips(id),
		undo: {
			get canUndo() {
				return engine.canUndoMix;
			},
			get canRedo() {
				return engine.canRedoMix;
			},
			undo: () => engine.undoMix(),
			redo: () => engine.redoMix(),
		},
	};
}

/** Dawn's engine as a mixer model: its tracks pan as stereo (a StereoPannerNode each); loudness is the fader alone until a track carries a measured figure. */
export function studioMixerModel(engine: typeof studio): MixerModel {
	return {
		get tracks() {
			return engine.arrangement.tracks.map((t, i) => ({
				id: t.id,
				number: i + 1,
				label: t.name,
				tint: t.colour ?? null,
				// A lane drives the level or the pan while the playhead passes (docs/dawn-daw-plan.md, D1).
				gain: engine.automatedValue(t.id, "volume"),
				pan: engine.automatedValue(t.id, "pan"),
				muted: t.muted,
				soloed: t.solo,
				mono: false,
				loudness: 0,
			}));
		},
		get master() {
			return engine.arrangement.master;
		},
		get anySolo() {
			return engine.anySolo;
		},
		get levels() {
			return engine.levels;
		},
		get masterLevel() {
			return engine.masterLevel;
		},
		setGain: (id, v) => engine.setGain(id, v),
		setPan: (id, v) => engine.setPan(id, v),
		toggleMute: (id) => engine.toggleMute(id),
		toggleSolo: (id) => engine.toggleSolo(id),
		setMaster: (v) => engine.setMaster(v),
		resetClips: (id) => engine.resetClips(id),
	};
}
