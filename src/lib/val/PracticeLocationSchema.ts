import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** A practice location's name (docs/band-plan.md, "Event"): required, unique in the account. */
export const PracticeLocationNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Give the location a name."),
	v.maxLength(160, "Keep the name under 160 characters."),
);
export const PracticeLocationAddressSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(300, "Keep the address under 300 characters."),
);
/** The band's notes on the place: the door code, where to park, who has the key. */
export const PracticeLocationNotesSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(2000, "Keep the notes under 2,000 characters."),
);

/** A practice location picked for a practice, or "" for none. */
export const PracticeLocationRefSchema = v.union([v.literal(""), NanoIdSchema]);

/** A new practice location in the account. */
export const PracticeLocationCreateSchema = v.object({
	accountId: NanoIdSchema,
	name: PracticeLocationNameSchema,
	address: v.optional(PracticeLocationAddressSchema, ""),
	notes: v.optional(PracticeLocationNotesSchema, ""),
});
export type PracticeLocationCreate = v.InferOutput<typeof PracticeLocationCreateSchema>;

/** A practice location's name, address and notes. */
export const PracticeLocationUpdateSchema = v.object({
	id: NanoIdSchema,
	name: PracticeLocationNameSchema,
	address: v.optional(PracticeLocationAddressSchema, ""),
	notes: v.optional(PracticeLocationNotesSchema, ""),
});
export type PracticeLocationUpdate = v.InferOutput<typeof PracticeLocationUpdateSchema>;
/** The fields a practice location write takes: name, address and notes. */
export type PracticeLocationFields = Omit<PracticeLocationUpdate, "id">;

export const PracticeLocationIdSchema = v.object({ id: NanoIdSchema });
