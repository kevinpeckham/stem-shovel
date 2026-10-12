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
		/** The gain at full Gain, as a multiplier before the clipper (1 at Gain 0, by an exponential law). */
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
		/** The gain at full Master before the soft clip (1 at 0, by an exponential law). */
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
/**
 * Captured cabinets (static/cabs, docs/practice-amp.md, "The cabinet"):
 * impulse responses of real cabinets from Jester Dyne Productions, CC0, a
 * choice beside each model's own synthesized cabinet. Guitar only so far.
 */
export interface AmpCabinetCapture {
	id: string;
	name: string;
	instrument: AmpInstrument;
	file: string;
}
export const AMP_CABINET_CAPTURES: AmpCabinetCapture[] = [
	{
		id: "greenback-57",
		name: "Greenback 4×12 · SM57",
		instrument: "guitar",
		file: "/cabs/greenback-57.wav",
	},
	{
		id: "greenback-57-low",
		name: "Greenback 4×12 · SM57 low",
		instrument: "guitar",
		file: "/cabs/greenback-57-low.wav",
	},
	{
		id: "greenback-e606",
		name: "Greenback 4×12 · e606",
		instrument: "guitar",
		file: "/cabs/greenback-e606.wav",
	},
	{ id: "v30-57", name: "Vintage 30 4×12 · SM57", instrument: "guitar", file: "/cabs/v30-57.wav" },
	{
		id: "v30-57-bright",
		name: "Vintage 30 4×12 · SM57 bright",
		instrument: "guitar",
		file: "/cabs/v30-57-bright.wav",
	},
	{ id: "dv77-57", name: "DV-77 4×12 · SM57", instrument: "guitar", file: "/cabs/dv77-57.wav" },
	{
		id: "rockdriver-e606",
		name: "Rockdriver Jr 4×12 · e606",
		instrument: "guitar",
		file: "/cabs/rockdriver-e606.wav",
	},
	{
		id: "v30-dv77-blend",
		name: "Vintage 30 + DV-77 · two SM57s",
		instrument: "guitar",
		file: "/cabs/v30-dv77-blend.wav",
	},
];
export const AMP_CABINET_CAPTURE_IDS = AMP_CABINET_CAPTURES.map((c) => c.id);
/** What each model's own cabinet is called in the Cabinet menu. */
export const AMP_MODEL_CABINET_LABEL: Record<AmpCabinetId, string> = {
	"open-2x12": "2×12 open-back (modelled)",
	"open-1x12": "1×12 open-back (modelled)",
	"fridge-8x10": "8×10 (modelled)",
	"combo-4x10": "4×10 with tweeter (modelled)",
};

export const AMP_MODELS_FOR: Record<AmpInstrument, AmpModel[]> = {
	guitar: [AMP_MODELS.clean, AMP_MODELS.tweed],
	bass: [AMP_MODELS.fridge, AMP_MODELS.solid],
};
/**
 * How the pedals are voiced for each instrument (docs/practice-amp.md,
 * "Voiced for the instrument"): a bass keeps its lows out of the clippers
 * and the chorus and reverb, the wah sweeps lower, and the compressor
 * starts slower and firmer. Applied live as the instrument switches; the
 * knobs' settings are the player's own.
 */
export interface AmpVoicing {
	/** The band under this passes the fuzz and the overdrive clean, mixed back in; 0 keeps nothing aside. */
	clipKeepLowsHz: number;
	/** The fuzz Tone knob's range, bottom to top, Hz. */
	fuzzToneHz: [number, number];
	/** The overdrive Tone knob's range, and the high-pass before its clipper. */
	overdriveToneHz: [number, number];
	overdriveHighPassHz: number;
	/** The fuzz's Mids knob: the cut at 0 and the lift at 10, dB. */
	fuzzMidsDb: [number, number];
	/** The wah's floor and how far it travels above it, Hz. */
	wahFloorHz: number;
	wahSpanHz: number;
	/** The chorus and the reverb pedal leave the band under this dry; 0 wets everything. */
	chorusKeepLowsHz: number;
	reverbKeepLowsHz: number;
	/** The compressor as a fresh rig starts: a bass wants the pluck through and a firmer squeeze. */
	compressor: { attack: number; ratio: number };
}
export const AMP_VOICING: Record<AmpInstrument, AmpVoicing> = {
	guitar: {
		clipKeepLowsHz: 0,
		fuzzToneHz: [700, 7000],
		overdriveToneHz: [1000, 6000],
		overdriveHighPassHz: 250,
		fuzzMidsDb: [-10, 6],
		wahFloorHz: 350,
		wahSpanHz: 1800,
		chorusKeepLowsHz: 0,
		reverbKeepLowsHz: 0,
		compressor: { attack: 0.01, ratio: 4 },
	},
	bass: {
		clipKeepLowsHz: 100,
		fuzzToneHz: [300, 3000],
		overdriveToneHz: [500, 3000],
		overdriveHighPassHz: 100,
		fuzzMidsDb: [-10, 6],
		wahFloorHz: 100,
		wahSpanHz: 1200,
		chorusKeepLowsHz: 200,
		reverbKeepLowsHz: 150,
		compressor: { attack: 0.02, ratio: 6 },
	},
};

/** An account keeps up to this many amp presets (docs/practice-amp.md, "Presets"). */
export const MAX_AMP_PRESETS = 100;
export const AMP_INSTRUMENT_LABELS: Record<AmpInstrument, string> = {
	guitar: "Guitar",
	bass: "Bass",
};
