import * as v from "valibot";
import {
	ARRANGEMENT_NAME_MAX,
	ARRANGEMENT_NOTE_MAX,
	MAX_ARRANGEMENTS,
} from "../constants/arrangements";
import { NanoIdSchema } from "./NanoIdSchema";
import { SecondsFieldSchema } from "./SecondsFieldSchema";

/** The starting points a new arrangement copies, besides another alternate's id: Main's stems, or none. */
export const ARRANGEMENT_SOURCES = ["main", "empty"] as const;

/** An arrangement's name: trimmed, 1–ARRANGEMENT_NAME_MAX characters ("Main" and a taken name are refused by the data layer). */
export const ArrangementNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("Give the arrangement a name."),
	v.maxLength(ARRANGEMENT_NAME_MAX, `Keep it under ${ARRANGEMENT_NAME_MAX} characters.`),
);

/** What the arrangement is for, in a line; empty when absent. */
export const ArrangementNoteSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(ARRANGEMENT_NOTE_MAX, `Keep the note under ${ARRANGEMENT_NOTE_MAX} characters.`),
);

/** Where a new arrangement starts: a copy of Main ("main"), nothing ("empty"), or a copy of one of the song's alternates (its id). */
export const ArrangementSourceSchema = v.union([v.picklist(ARRANGEMENT_SOURCES), NanoIdSchema]);
export type ArrangementSource = v.InferOutput<typeof ArrangementSourceSchema>;

/** The createArrangement form: a popover with a name, a note and a "start from" select. */
export const ArrangementCreateSchema = v.object({
	songId: NanoIdSchema,
	name: ArrangementNameSchema,
	note: v.optional(ArrangementNoteSchema, ""),
	from: v.optional(ArrangementSourceSchema, "main"),
});
export type ArrangementCreate = v.InferOutput<typeof ArrangementCreateSchema>;

/** The updateArrangement form: a new name, a new note, or both; a field left out stays. */
export const ArrangementUpdateSchema = v.object({
	id: NanoIdSchema,
	name: v.optional(ArrangementNameSchema),
	note: v.optional(ArrangementNoteSchema),
});
export type ArrangementUpdate = v.InferOutput<typeof ArrangementUpdateSchema>;

/** The reorderArrangements command: a song's alternates in the order the switcher lists them, first first. */
export const ArrangementOrderSchema = v.object({
	songId: NanoIdSchema,
	ids: v.pipe(v.array(NanoIdSchema), v.minLength(1), v.maxLength(MAX_ARRANGEMENTS)),
});
export type ArrangementOrder = v.InferOutput<typeof ArrangementOrderSchema>;

/** Which arrangement a stem command acts on: an alternate's id, or null (or absent) for Main. */
export const ArrangementRefSchema = v.optional(v.nullable(NanoIdSchema), null);

/** The saveArrangementSpan form: an alternate's own start of bar 1 and end in seconds ("" for the start or the end of the audio), checked as the song's are. */
export const ArrangementSpanSchema = v.object({
	id: NanoIdSchema,
	startAt: SecondsFieldSchema,
	endAt: SecondsFieldSchema,
});
export type ArrangementSpan = v.InferOutput<typeof ArrangementSpanSchema>;
