import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * A progression from the chord player's pad (docs/chord-player.md, "The
 * progression pad"): the tempo and time signature it was jotted at and
 * its entries, a chord (its name, the wedge it lights, its MIDI notes, its
 * beats) or a rest. Kept per browser as it is worked on and saved to an
 * account's library by name.
 */
const BeatsSchema = v.picklist([1, 2, 4]);
const MidiNoteSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127));

export const ProgressionEntrySchema = v.variant("kind", [
	v.object({
		kind: v.literal("chord"),
		label: v.pipe(v.string(), v.maxLength(16)),
		wedge: v.pipe(v.string(), v.maxLength(16)),
		notes: v.pipe(v.array(MidiNoteSchema), v.minLength(1), v.maxLength(12)),
		beats: BeatsSchema,
	}),
	v.object({ kind: v.literal("rest"), beats: BeatsSchema }),
]);

export const ProgressionDataSchema = v.object({
	bpm: v.pipe(v.number(), v.minValue(30), v.maxValue(300)),
	beatsPerBar: v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(6)),
	entries: v.pipe(v.array(ProgressionEntrySchema), v.maxLength(400)),
});
export type ProgressionData = v.InferOutput<typeof ProgressionDataSchema>;

/** Argument of saveProgression: a new one in the account, or the one named by `id` brought up to date. */
export const ProgressionSaveSchema = v.object({
	accountId: NanoIdSchema,
	id: v.optional(NanoIdSchema),
	name: NameSchema,
	data: ProgressionDataSchema,
});
export type ProgressionSave = v.InferOutput<typeof ProgressionSaveSchema>;

export const ProgressionRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });
export type ProgressionRename = v.InferOutput<typeof ProgressionRenameSchema>;

/** Argument of listProgressions. */
export const ProgressionListSchema = v.object({ accountId: NanoIdSchema });
