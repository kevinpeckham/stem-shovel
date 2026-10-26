import * as v from "valibot";
import { SESSION_KINDS } from "../constants/sessionRecordings";
import { NanoIdSchema } from "./NanoIdSchema";
import { PlaybackEqSchema } from "./PlaybackEqSchema";

export const SessionKindSchema = v.picklist(SESSION_KINDS);

/** A calendar day as the uploader's browser gave it, `YYYY-MM-DD`, with no time zone to shift it. */
export const IsoDaySchema = v.pipe(
	v.string(),
	v.regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date as YYYY-MM-DD."),
);

const NameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(120, "Keep the name under 120 characters."),
);
const PlaceSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(120, "Keep the place under 120 characters."),
);
const NotesSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(2000, "Keep the notes under 2,000 characters."),
);

/** A session's own words (docs/data-model.md, recording_session): kind, name, the day it starts, place, notes. */
export const RecordingSessionCreateSchema = v.object({
	accountId: NanoIdSchema,
	kind: SessionKindSchema,
	name: NameSchema,
	startsOn: IsoDaySchema,
	place: PlaceSchema,
	notes: v.optional(NotesSchema, ""),
});
export type RecordingSessionCreate = v.InferOutput<typeof RecordingSessionCreateSchema>;

export const RecordingSessionUpdateSchema = v.object({
	id: NanoIdSchema,
	kind: SessionKindSchema,
	name: NameSchema,
	startsOn: IsoDaySchema,
	place: PlaceSchema,
	notes: NotesSchema,
});
export type RecordingSessionUpdate = v.InferOutput<typeof RecordingSessionUpdateSchema>;

/** The playback EQ saved on a session for everyone in the account; null clears it. */
export const RecordingSessionEqSchema = v.object({
	id: NanoIdSchema,
	eq: v.nullable(PlaybackEqSchema),
});
export type RecordingSessionEq = v.InferOutput<typeof RecordingSessionEqSchema>;

export const RecordingSessionDeleteSchema = v.object({ id: NanoIdSchema });

/** A recording's own words and the session it belongs to (its day must be the session's or the day after). */
/** The input's name, where a recording was captured ("Kevin's phone", "Room mic"); empty for unknown. */
export const SourceSchema = v.optional(
	v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep the input name under 120 characters.")),
	"",
);

/** The kinds of device a recording is captured on, in the order the selects list them; labels in constants/sessionRecordings.ts. */
export const SESSION_DEVICE_VALUES = [
	"soundboard",
	"field-rig",
	"phone",
	"handheld",
	"other",
] as const;

/** What kind of device captured a recording (constants/sessionRecordings.ts SESSION_DEVICE_LABELS); "" for unset. */
export const SessionDeviceSchema = v.optional(v.picklist([...SESSION_DEVICE_VALUES, ""]), "");
export type SessionDevice = v.InferOutput<typeof SessionDeviceSchema>;

export const SessionRecordingUpdateSchema = v.object({
	id: NanoIdSchema,
	sessionId: NanoIdSchema,
	title: NameSchema,
	recordedOn: IsoDaySchema,
	notes: NotesSchema,
	source: SourceSchema,
	device: SessionDeviceSchema,
	/** The song it records, one of the account's; "" for none. */
	songId: v.optional(v.union([NanoIdSchema, v.literal("")]), ""),
	/** Anyone with its page's address may listen and download; private by default. */
	isPublic: v.optional(v.boolean(), false),
});
export type SessionRecordingUpdate = v.InferOutput<typeof SessionRecordingUpdateSchema>;

export const SessionRecordingDeleteSchema = v.object({ id: NanoIdSchema });
export type SessionRecordingDelete = v.InferOutput<typeof SessionRecordingDeleteSchema>;
