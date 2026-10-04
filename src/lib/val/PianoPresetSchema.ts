import * as v from "valibot";
import { CHORD_VOICINGS, STRUMS } from "$lib/constants/circleOfFifths";
import { PIANO_INSTRUMENT_IDS } from "$lib/constants/piano";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * A piano preset (docs/piano.md, "Presets"): the sound and every effect,
 * nothing about the room or the song (volume, octave, key and labels stay
 * as they are when a preset loads). Every field is optional with the
 * engine's default, so a preset saved before an effect existed still
 * parses, and a share link's payload is checked by the same schema.
 */
const unit = (fallback: number) =>
	v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), fallback);
export const PianoPresetDataSchema = v.object({
	instrument: v.optional(v.picklist(PIANO_INSTRUMENT_IDS), "grand"),
	reverb: unit(0.25),
	reverbSize: unit(0.35),
	delay: v.optional(
		v.object({
			time: v.optional(v.pipe(v.number(), v.minValue(0.05), v.maxValue(1)), 0.35),
			feedback: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(0.9)), 0.35),
			level: unit(0),
			analog: v.optional(v.boolean(), false),
		}),
		() => ({ time: 0.35, feedback: 0.35, level: 0, analog: false }),
	),
	chorus: v.optional(
		v.object({
			rate: v.optional(v.pipe(v.number(), v.minValue(0.1), v.maxValue(5)), 0.8),
			depth: unit(0.5),
			mix: unit(0),
		}),
		() => ({ rate: 0.8, depth: 0.5, mix: 0 }),
	),
	phaser: v.optional(
		v.object({
			mode: v.optional(v.picklist(["phaser", "flanger"]), "phaser"),
			rate: v.optional(v.pipe(v.number(), v.minValue(0.1), v.maxValue(5)), 0.5),
			depth: unit(0.7),
			mix: unit(0),
		}),
		() => ({ mode: "phaser" as const, rate: 0.5, depth: 0.7, mix: 0 }),
	),
	tremolo: v.optional(
		v.object({
			rate: v.optional(v.pipe(v.number(), v.minValue(0.5), v.maxValue(12)), 5),
			depth: unit(0),
			shape: v.optional(v.picklist(["sine", "square"]), "sine"),
		}),
		() => ({ rate: 5, depth: 0, shape: "sine" as const }),
	),
	fuzz: v.optional(v.object({ drive: unit(0), tone: unit(0.5) }), () => ({ drive: 0, tone: 0.5 })),
	wah: v.optional(
		v.object({
			mode: v.optional(v.picklist(["touch", "sweep"]), "touch"),
			sensitivity: unit(0.5),
			rate: v.optional(v.pipe(v.number(), v.minValue(0.1), v.maxValue(5)), 1),
			range: unit(0.7),
			resonance: unit(0.5),
			mix: unit(0),
		}),
		() => ({
			mode: "touch" as const,
			sensitivity: 0.5,
			rate: 1,
			range: 0.7,
			resonance: 0.5,
			mix: 0,
		}),
	),
	tone: v.optional(
		v.object({
			tilt: v.optional(v.pipe(v.number(), v.minValue(-1), v.maxValue(1)), 0),
			air: unit(0),
			bottom: unit(0),
		}),
		() => ({ tilt: 0, air: 0, bottom: 0 }),
	),
	rotary: v.optional(
		v.object({ speed: v.optional(v.picklist(["off", "slow", "fast"]), "off") }),
		() => ({ speed: "off" as const }),
	),
	/** The chord player's mode, style, voicing, octave and strum, when the preset was saved there. */
	chords: v.optional(v.lazy(() => ChordPresetSettingsSchema)),
});
export type PianoPresetData = v.InferOutput<typeof PianoPresetDataSchema>;

/** The chord player's own settings a preset saved there carries (docs/chord-player.md, "Presets"): absent on a preset saved from the piano. */
export const ChordPresetSettingsSchema = v.object({
	mode: v.picklist(["chords", "notes"]),
	/** A built-in style id or "custom:<id>"; one the account no longer has falls back to plain. */
	style: v.pipe(v.string(), v.maxLength(48)),
	voicing: v.picklist(CHORD_VOICINGS.map((c) => c.id)),
	octave: v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(6)),
	strum: v.picklist(STRUMS.map((s) => s.id)),
	/** The arpeggiator, on or off, and its pattern; absent on presets saved before it existed. */
	arp: v.optional(
		v.object({
			on: v.boolean(),
			rate: v.picklist(["4", "8", "8t", "16"]),
			pattern: v.picklist(["up", "down", "updown", "played", "random"]),
			octaves: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
			gate: v.pipe(v.number(), v.minValue(0.1), v.maxValue(1)),
			latch: v.boolean(),
			/** The pattern restarting at every bar or two (presets from before carry neither). */
			align: v.optional(v.boolean()),
			alignBars: v.optional(v.picklist([1, 2])),
			onBeat: v.optional(v.boolean()),
			swing: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
		}),
	),
});
export type ChordPresetSettings = v.InferOutput<typeof ChordPresetSettingsSchema>;

/** The slot buttons: 1 to 5. */
export const PIANO_PRESET_SLOTS = 5;
export const PianoPresetSlotSchema = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(1),
	v.maxValue(PIANO_PRESET_SLOTS),
);

/** The instruments with preset buttons on the shared library: the piano's slots, or the chord player's. */
export const PRESET_INSTRUMENTS = ["piano", "chords"] as const;
export type PresetInstrument = (typeof PRESET_INSTRUMENTS)[number];
export const PresetInstrumentSchema = v.optional(v.picklist(PRESET_INSTRUMENTS), "piano");

/** A named preset, as the site's defaults and a browser's overrides keep them. */
export const NamedPianoPresetSchema = v.object({ name: NameSchema, data: PianoPresetDataSchema });
export type NamedPianoPreset = v.InferOutput<typeof NamedPianoPresetSchema>;

/** Argument of the savePianoPreset command: a new preset in the account, or the one named by `id` brought up to date; `slot` puts it on a button (taking the slot from any other). */
export const PianoPresetSaveSchema = v.object({
	accountId: NanoIdSchema,
	id: v.optional(NanoIdSchema),
	name: NameSchema,
	slot: v.optional(v.nullable(PianoPresetSlotSchema)),
	/** Whose button `slot` is: the piano's (the default) or the chord player's. */
	instrument: PresetInstrumentSchema,
	data: PianoPresetDataSchema,
});
export const PianoPresetRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });
export const PianoPresetSetSlotSchema = v.object({
	id: NanoIdSchema,
	slot: v.nullable(PianoPresetSlotSchema),
	instrument: PresetInstrumentSchema,
});
export const PianoPresetListSchema = v.object({ accountId: NanoIdSchema });
/** Argument of the admin's setSitePianoPreset: the demo's preset for a slot. */
export const SitePianoPresetSchema = v.object({
	slot: PianoPresetSlotSchema,
	instrument: PresetInstrumentSchema,
	name: NameSchema,
	data: PianoPresetDataSchema,
});
export const SitePianoPresetSlotSchema = v.object({
	slot: PianoPresetSlotSchema,
	instrument: PresetInstrumentSchema,
});
