import type { AmpHead, AmpInstrument, AmpModelId } from "#lib/val/AmpSchema.js";

/**
 * The Practice Amp's models (docs/practice-amp.md): each a preamp
 * character, a tone stack's corners, a power stage and a cabinet, with
 * the knobs it puts on its face and the head it starts at. The names are
 * generic (Kevin): the eras and the nicknames, not the brands.
 */
export type AmpCabinetId = "open-2x12" | "open-1x12" | "fridge-8x10" | "combo-4x10";
export type AmpPreampCurve = "clean" | "tweed" | "tube" | "solid";

export interface AmpModel {
	id: AmpModelId;
	instrument: AmpInstrument;
	name: string;
	/** One line on the face and in the docs. */
	blurb: string;
	preamp: {
		curve: AmpPreampCurve;
		/** The gain at full drive, as a multiplier before the clipper. */
		drive: number;
		/** The high-pass before the clipper: what the preamp will not bother distorting. */
		highPassHz: number;
		/** The low-pass after it: a tube stage's own top end. */
		lowPassHz: number;
		/** The bass heads keep the fundamentals beside the clipper: the band under this passes clean. */
		keepLowsHz: number | null;
	};
	tone: {
		bassHz: number;
		/** The mid band's centre; null means the head's selector picks it (AMP_MID_FREQUENCIES). */
		midHz: number | null;
		trebleHz: number;
		/** The passive stack's scoop at flat knobs, in dB taken from the mids. */
		scoopDb: number;
	};
	power: {
		/** The gain at full Power before the soft clip. */
		drive: number;
		/** How much the supply sags under a loud passage, 0 to 1. */
		sag: number;
	};
	cabinet: AmpCabinetId;
	/** Which switches the face shows. */
	switches: ("bright" | "ultraLo" | "ultraHi" | "midFreq")[];
	/** The head's own effects. */
	hasReverb: boolean;
	hasTremolo: boolean;
	defaults: Partial<AmpHead>;
}

export const AMP_MODELS: Record<AmpModelId, AmpModel> = {
	clean: {
		id: "clean",
		instrument: "guitar",
		name: "Blackface Clean",
		blurb: "A 1960s American clean combo: headroom, a scooped stack, spring reverb and tremolo.",
		preamp: { curve: "clean", drive: 8, highPassHz: 60, lowPassHz: 9000, keepLowsHz: null },
		tone: { bassHz: 100, midHz: 500, trebleHz: 2500, scoopDb: 4 },
		power: { drive: 4, sag: 0.25 },
		cabinet: "open-2x12",
		switches: ["bright"],
		hasReverb: true,
		hasTremolo: true,
		defaults: { gain: 0.35, reverb: 0.2, presence: 0.3 },
	},
	tweed: {
		id: "tweed",
		instrument: "guitar",
		name: "Tweed Crunch",
		blurb: "A 1950s tweed combo pushed hard: early break-up, a fat midrange, a single speaker.",
		preamp: { curve: "tweed", drive: 25, highPassHz: 80, lowPassHz: 7000, keepLowsHz: null },
		tone: { bassHz: 120, midHz: 650, trebleHz: 2200, scoopDb: 0 },
		power: { drive: 6, sag: 0.5 },
		cabinet: "open-1x12",
		switches: ["bright"],
		hasReverb: false,
		hasTremolo: false,
		defaults: { gain: 0.55, reverb: 0, presence: 0.4, power: 0.4 },
	},
	fridge: {
		id: "fridge",
		instrument: "bass",
		name: "Fridge",
		blurb:
			"An all-tube bass head on the eight-ten that earned the nickname: warm, deep, grit on demand.",
		preamp: { curve: "tube", drive: 12, highPassHz: 30, lowPassHz: 6000, keepLowsHz: 80 },
		tone: { bassHz: 80, midHz: null, trebleHz: 2000, scoopDb: 1 },
		power: { drive: 5, sag: 0.45 },
		cabinet: "fridge-8x10",
		switches: ["ultraLo", "ultraHi", "midFreq"],
		hasReverb: false,
		hasTremolo: false,
		defaults: { gain: 0.3, reverb: 0, presence: 0.2, power: 0.3 },
	},
	solid: {
		id: "solid",
		instrument: "bass",
		name: "Solid State",
		blurb:
			"A modern solid-state bass combo with a tweeter: clean, tight and bright until it is asked to clip.",
		preamp: { curve: "solid", drive: 6, highPassHz: 35, lowPassHz: 12000, keepLowsHz: 60 },
		tone: { bassHz: 80, midHz: null, trebleHz: 2500, scoopDb: 0 },
		power: { drive: 3, sag: 0.05 },
		cabinet: "combo-4x10",
		switches: ["ultraLo", "ultraHi", "midFreq"],
		hasReverb: false,
		hasTremolo: false,
		defaults: { gain: 0.3, reverb: 0, presence: 0.4, power: 0.15 },
	},
};
export const AMP_MODELS_FOR: Record<AmpInstrument, AmpModel[]> = {
	guitar: [AMP_MODELS.clean, AMP_MODELS.tweed],
	bass: [AMP_MODELS.fridge, AMP_MODELS.solid],
};
export const AMP_INSTRUMENT_LABELS: Record<AmpInstrument, string> = {
	guitar: "Guitar",
	bass: "Bass",
};
