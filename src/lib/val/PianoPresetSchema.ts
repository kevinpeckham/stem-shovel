import * as v from "valibot";
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
	rotary: v.optional(
		v.object({ speed: v.optional(v.picklist(["off", "slow", "fast"]), "off") }),
		() => ({ speed: "off" as const }),
	),
});
export type PianoPresetData = v.InferOutput<typeof PianoPresetDataSchema>;

/** The slot buttons: 1 to 5. */
export const PIANO_PRESET_SLOTS = 5;
export const PianoPresetSlotSchema = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(1),
	v.maxValue(PIANO_PRESET_SLOTS),
);

/** A named preset, as the site's defaults and a browser's overrides keep them. */
export const NamedPianoPresetSchema = v.object({ name: NameSchema, data: PianoPresetDataSchema });
export type NamedPianoPreset = v.InferOutput<typeof NamedPianoPresetSchema>;

/** Argument of the savePianoPreset command: a new preset in the account, or the one named by `id` brought up to date; `slot` puts it on a button (taking the slot from any other). */
export const PianoPresetSaveSchema = v.object({
	accountId: NanoIdSchema,
	id: v.optional(NanoIdSchema),
	name: NameSchema,
	slot: v.optional(v.nullable(PianoPresetSlotSchema)),
	data: PianoPresetDataSchema,
});
export const PianoPresetRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });
export const PianoPresetSetSlotSchema = v.object({
	id: NanoIdSchema,
	slot: v.nullable(PianoPresetSlotSchema),
});
export const PianoPresetListSchema = v.object({ accountId: NanoIdSchema });
/** Argument of the admin's setSitePianoPreset: the demo's preset for a slot. */
export const SitePianoPresetSchema = v.object({
	slot: PianoPresetSlotSchema,
	name: NameSchema,
	data: PianoPresetDataSchema,
});
export const SitePianoPresetSlotSchema = v.object({ slot: PianoPresetSlotSchema });
