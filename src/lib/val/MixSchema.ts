import * as v from "valibot";
import { MIX_NOTES_MAX } from "../constants/mixFormats";
import { NanoIdSchema } from "./NanoIdSchema";

/** Renaming a mix (docs/mixes.md): the label beside its version. */
export const MixRenameSchema = v.object({
	id: NanoIdSchema,
	label: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Give the mix a name."),
		v.maxLength(120, "Keep the name under 120 characters."),
	),
});

/** The engineer's notes on a mix, markdown; empty clears them. */
export const MixNotesSchema = v.object({
	id: NanoIdSchema,
	notes: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(MIX_NOTES_MAX, `Keep the notes under ${MIX_NOTES_MAX} characters.`),
	),
});

export type MixRenameInput = v.InferOutput<typeof MixRenameSchema>;
export type MixNotesInput = v.InferOutput<typeof MixNotesSchema>;
