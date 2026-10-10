import * as v from "valibot";

/**
 * The Practice Amp's settings (docs/practice-amp.md): the instrument,
 * the input, and a rig per instrument (the amp model, its knobs and the
 * pedals), remembered per browser and the shape of a preset. Every field
 * is optional with its default, so settings saved before a knob existed
 * still parse.
 */
export const AMP_INSTRUMENTS = ["guitar", "bass"] as const;
export type AmpInstrument = (typeof AMP_INSTRUMENTS)[number];
/** The amp models: two for the guitar, two for the bass (src/lib/constants/amp.ts). */
export const AMP_MODEL_IDS = ["clean", "tweed", "fridge", "solid"] as const;
export type AmpModelId = (typeof AMP_MODEL_IDS)[number];
/** What is plugged in: an instrument straight into the jack (quiet: more trim), or an audio interface's line (unity). */
export const AMP_INPUT_MODES = ["instrument", "line"] as const;
export type AmpInputMode = (typeof AMP_INPUT_MODES)[number];
/** The bass head's mid-frequency selector, in Hz. */
export const AMP_MID_FREQUENCIES = [220, 450, 800, 1600, 3000] as const;
export const ROTARY_SPEEDS = ["off", "slow", "fast"] as const;

const unit = (fallback: number) =>
	v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), fallback);
const range = (min: number, max: number, fallback: number) =>
	v.optional(v.pipe(v.number(), v.minValue(min), v.maxValue(max)), fallback);

export const AmpHeadSchema = v.object({
	/** The preamp's drive. */
	gain: unit(0.35),
	bass: unit(0.5),
	mid: unit(0.5),
	/** An index into AMP_MID_FREQUENCIES (the bass heads). */
	midFreq: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4)), 2),
	treble: unit(0.5),
	/** The guitar heads' bright switch. */
	bright: v.optional(v.boolean(), false),
	/** The bass heads' Ultra Lo and Ultra Hi switches. */
	ultraLo: v.optional(v.boolean(), false),
	ultraHi: v.optional(v.boolean(), false),
	presence: unit(0.3),
	/** How hard the power stage is pushed (sag and a soft clip). */
	power: unit(0.25),
	/** The spring reverb's level (the guitar heads). */
	reverb: unit(0.2),
	tremolo: v.optional(v.object({ rate: range(0.5, 12, 4.5), depth: unit(0) }), () => ({
		rate: 4.5,
		depth: 0,
	})),
	master: unit(0.7),
});
export type AmpHead = v.InferOutput<typeof AmpHeadSchema>;

export const AmpPedalsSchema = v.object({
	gate: v.optional(
		v.object({ on: v.optional(v.boolean(), false), threshold: range(-70, -20, -50) }),
		() => ({ on: false, threshold: -50 }),
	),
	compressor: v.optional(
		v.object({
			amount: unit(0),
			ratio: range(1, 20, 4),
			attack: range(0.001, 0.1, 0.01),
			release: range(0.02, 1, 0.25),
			makeup: range(0, 24, 0),
		}),
		() => ({ amount: 0, ratio: 4, attack: 0.01, release: 0.25, makeup: 0 }),
	),
	overdrive: v.optional(v.object({ drive: unit(0), tone: unit(0.5) }), () => ({
		drive: 0,
		tone: 0.5,
	})),
	fuzz: v.optional(v.object({ drive: unit(0), tone: unit(0.5) }), () => ({ drive: 0, tone: 0.5 })),
	wah: v.optional(
		v.object({
			mode: v.optional(v.picklist(["touch", "sweep"]), "touch"),
			sensitivity: unit(0.6),
			rate: range(0.1, 5, 1),
			range: unit(0.7),
			resonance: unit(0.5),
			mix: unit(0),
		}),
		() => ({
			mode: "touch" as const,
			sensitivity: 0.6,
			rate: 1,
			range: 0.7,
			resonance: 0.5,
			mix: 0,
		}),
	),
	chorus: v.optional(
		v.object({ rate: range(0.1, 5, 0.8), depth: unit(0.5), mix: unit(0) }),
		() => ({ rate: 0.8, depth: 0.5, mix: 0 }),
	),
	phaser: v.optional(
		v.object({
			mode: v.optional(v.picklist(["phaser", "flanger"]), "phaser"),
			rate: range(0.1, 5, 0.5),
			depth: unit(0.7),
			mix: unit(0),
		}),
		() => ({ mode: "phaser" as const, rate: 0.5, depth: 0.7, mix: 0 }),
	),
	delay: v.optional(
		v.object({
			time: range(0.05, 1, 0.35),
			feedback: range(0, 0.9, 0.3),
			level: unit(0),
			analog: v.optional(v.boolean(), true),
		}),
		() => ({ time: 0.35, feedback: 0.3, level: 0, analog: true }),
	),
	rotary: v.optional(v.object({ speed: v.optional(v.picklist(ROTARY_SPEEDS), "off") }), () => ({
		speed: "off" as const,
	})),
});
export type AmpPedals = v.InferOutput<typeof AmpPedalsSchema>;

/** One instrument's rig: the model, the head's knobs and the pedals. */
export const AmpRigSchema = v.object({
	model: v.optional(v.picklist(AMP_MODEL_IDS), "clean"),
	head: v.optional(AmpHeadSchema, () => v.parse(AmpHeadSchema, {})),
	pedals: v.optional(AmpPedalsSchema, () => v.parse(AmpPedalsSchema, {})),
});
export type AmpRig = v.InferOutput<typeof AmpRigSchema>;

export const AmpPreferencesSchema = v.object({
	instrument: v.optional(v.picklist(AMP_INSTRUMENTS), "guitar"),
	inputMode: v.optional(v.picklist(AMP_INPUT_MODES), "instrument"),
	/** The input source: the line in (an interface) or the microphone input (an instrument into the jack, an acoustic through the mic). */
	source: v.optional(v.picklist(["line", "mic"]), "line"),
	/** The input trim in dB, per input mode. */
	trimDb: v.optional(v.object({ instrument: range(-12, 24, 12), line: range(-12, 24, 0) }), () => ({
		instrument: 12,
		line: 0,
	})),
	guitar: v.optional(AmpRigSchema, () => v.parse(AmpRigSchema, { model: "clean" })),
	bass: v.optional(AmpRigSchema, () => v.parse(AmpRigSchema, { model: "fridge" })),
});
export type AmpPreferences = v.InferOutput<typeof AmpPreferencesSchema>;
