import * as v from "valibot";
import { SESSION_KINDS } from "../constants/sessionRecordings";
import { NanoIdSchema } from "./NanoIdSchema";

export const SessionKindSchema = v.picklist(SESSION_KINDS);

/** A calendar day as the uploader's browser gave it, `YYYY-MM-DD`, with no time zone to shift it. */
export const RecordedOnSchema = v.pipe(
	v.string(),
	v.regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date as YYYY-MM-DD."),
);

/** A session recording's own words (docs/data-model.md, session_recording): its kind, title, date, place and notes. */
export const SessionRecordingUpdateSchema = v.object({
	id: NanoIdSchema,
	kind: SessionKindSchema,
	title: v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep the title under 120 characters.")),
	recordedOn: RecordedOnSchema,
	place: v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep the place under 120 characters.")),
	notes: v.pipe(v.string(), v.trim(), v.maxLength(2000, "Keep the notes under 2,000 characters.")),
});
export type SessionRecordingUpdate = v.InferOutput<typeof SessionRecordingUpdateSchema>;

export const SessionRecordingDeleteSchema = v.object({ id: NanoIdSchema });
export type SessionRecordingDelete = v.InferOutput<typeof SessionRecordingDeleteSchema>;
