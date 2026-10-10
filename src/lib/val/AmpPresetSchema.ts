import * as v from "valibot";
import { AMP_INSTRUMENTS, AmpRigSchema } from "./AmpSchema";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * A Practice Amp preset (docs/practice-amp.md, "Presets"): a rig, the
 * head model with its knobs and the pedals, nothing about the room (the
 * input, the trim and the master stay as they are when one loads).
 * Every field is optional with the engine's default (AmpRigSchema), so a
 * preset saved before a pedal existed still parses. Presets are per
 * instrument: a guitar rig and a bass rig keep separate buttons.
 */
export const AmpPresetDataSchema = AmpRigSchema;
export type AmpPresetData = v.InferOutput<typeof AmpPresetDataSchema>;

/** The slot buttons: 1 to 6, per instrument. */
export const AMP_PRESET_SLOTS = 6;
export const AmpPresetSlotSchema = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(1),
	v.maxValue(AMP_PRESET_SLOTS),
);
export const AmpPresetInstrumentSchema = v.picklist(AMP_INSTRUMENTS);

/** A named preset, as the site's defaults and a browser's overrides keep them, and as a share link carries one. */
export const NamedAmpPresetSchema = v.object({ name: NameSchema, data: AmpPresetDataSchema });
export type NamedAmpPreset = v.InferOutput<typeof NamedAmpPresetSchema>;

/** Argument of the saveAmpPreset command: a new preset in the account, or the one named by `id` brought up to date; `slot` puts it on a button (taking the slot from any other of the instrument's). */
export const AmpPresetSaveSchema = v.object({
	accountId: NanoIdSchema,
	id: v.optional(NanoIdSchema),
	name: NameSchema,
	instrument: AmpPresetInstrumentSchema,
	slot: v.optional(v.nullable(AmpPresetSlotSchema)),
	data: AmpPresetDataSchema,
});
export const AmpPresetRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });
export const AmpPresetSetSlotSchema = v.object({
	id: NanoIdSchema,
	slot: v.nullable(AmpPresetSlotSchema),
});
export const AmpPresetListSchema = v.object({ accountId: NanoIdSchema });
/** Argument of the admin's setSiteAmpPreset: the site's default for an instrument's slot. */
export const SiteAmpPresetSchema = v.object({
	instrument: AmpPresetInstrumentSchema,
	slot: AmpPresetSlotSchema,
	name: NameSchema,
	data: AmpPresetDataSchema,
});
export const SiteAmpPresetSlotSchema = v.object({
	instrument: AmpPresetInstrumentSchema,
	slot: AmpPresetSlotSchema,
});
