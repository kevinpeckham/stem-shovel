import * as v from "valibot";
import { DEMO_NOTES_MAX } from "../constants/demoFormats";
import { NanoIdSchema } from "./NanoIdSchema";

/** What a demo's notes over the limit are told, at upload (the reserve route) and on an edit (setDemoNotes). */
export const DEMO_NOTES_TOO_LONG = `A demo's notes can be at most ${DEMO_NOTES_MAX} characters.`;

/** A demo's notes: plain text, trimmed, at most DEMO_NOTES_MAX characters; empty for none. */
export const DemoNotesTextSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(DEMO_NOTES_MAX, DEMO_NOTES_TOO_LONG),
);

/** The setDemoNotes form: a demo's notes changed after upload (an empty field clears them). */
export const DemoNotesSchema = v.object({
	id: NanoIdSchema,
	notes: v.optional(DemoNotesTextSchema, ""),
});
export type DemoNotes = v.InferOutput<typeof DemoNotesSchema>;
