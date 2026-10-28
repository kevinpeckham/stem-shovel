import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";
import { IsoDaySchema } from "./SessionRecordingSchema";
import {
	VenueAddressSchema,
	VenueCitySchema,
	VenueMapUrlSchema,
	VenueNotesSchema as VenueOwnNotesSchema,
	VenueRefSchema,
} from "./VenueSchema";
import { PracticeLocationRefSchema } from "./PracticeLocationSchema";

/** What an event is (docs/band-plan.md, "Event"): a show or a practice. */
export const EVENT_KINDS = ["show", "practice"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_KIND_LABELS: Record<EventKind, string> = {
	show: "Show",
	practice: "Practice",
};
export const EventKindSchema = v.picklist(EVENT_KINDS);

/** Where an event stands; a canceled show stays on the record. */
export const EVENT_STATUSES = ["planned", "confirmed", "played", "canceled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
	planned: "Planned",
	confirmed: "Confirmed",
	played: "Played",
	canceled: "Canceled",
};
export const EventStatusSchema = v.picklist(EVENT_STATUSES);

/** How many shows and practices an account may keep. */
export const MAX_EVENTS_PER_ACCOUNT = 2000;
/** How many sets (attached set lists) one event may carry. */
export const MAX_EVENT_SETS = 20;

/** A local wall-clock time, `HH:MM` on the 24-hour clock with no time zone (the venue's time), or "" for none. */
export const TimeSchema = v.optional(
	v.pipe(
		v.string(),
		v.trim(),
		v.union([
			v.literal(""),
			v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 19:30.")),
		]),
	),
	"",
);

/** Trimmed text of at most `max` characters, "" when left out. */
const text = (max: number, what: string) =>
	v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.maxLength(max, `Keep the ${what} under ${max.toLocaleString("en-US")} characters.`),
		),
		"",
	);

const TitleSchema = text(160, "title");
const NotesSchema = text(20000, "notes");
const LabelSchema = text(60, "label");

/** The free-text venue name from before venues were their own rows (legacy, still accepted). */
const VenueTextSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(160, "Keep the venue under 160 characters."),
);

/** A new show or practice (docs/band-plan.md, "Event"): its account, kind and day, and a title and venue (`venueId`, "" for none) to start with; `venue` is the legacy free text, still accepted. */
export const EventCreateSchema = v.object({
	accountId: NanoIdSchema,
	kind: EventKindSchema,
	title: TitleSchema,
	startsOn: IsoDaySchema,
	venueId: v.optional(VenueRefSchema, ""),
	/** A practice's location (`locationId`, "" for none); a show ignores it. */
	locationId: v.optional(PracticeLocationRefSchema, ""),
	venue: v.optional(VenueTextSchema, ""),
});
export type EventCreate = v.InferOutput<typeof EventCreateSchema>;

/**
 * The event's own words: when, where (`venueId`, "" for none, left out to
 * keep it) and the notes. The legacy free-text place fields are optional
 * and left alone when not sent (the venue's own row holds them now).
 */
export const EventUpdateSchema = v.object({
	id: NanoIdSchema,
	kind: EventKindSchema,
	title: TitleSchema,
	status: EventStatusSchema,
	startsOn: IsoDaySchema,
	startsAt: TimeSchema,
	endsAt: TimeSchema,
	loadInAt: TimeSchema,
	soundCheckAt: TimeSchema,
	venueId: v.optional(VenueRefSchema),
	/** A practice's location: "" for none, left out to keep it; a show ignores it. */
	locationId: v.optional(PracticeLocationRefSchema),
	venue: v.optional(VenueTextSchema),
	address: v.optional(VenueAddressSchema),
	city: v.optional(VenueCitySchema),
	mapUrl: v.optional(VenueMapUrlSchema),
	venueNotes: v.optional(VenueOwnNotesSchema),
	notes: NotesSchema,
});
export type EventUpdate = v.InferOutput<typeof EventUpdateSchema>;
/** The fields `updateEvent` writes: everything but the id. */
export type EventFields = Omit<EventUpdate, "id">;

export const EventIdSchema = v.object({ id: NanoIdSchema });
export type EventId = v.InferOutput<typeof EventIdSchema>;

/** A set list attached to the event as its next set. */
export const EventSetAddSchema = v.object({ eventId: NanoIdSchema, setListId: NanoIdSchema });
export type EventSetAdd = v.InferOutput<typeof EventSetAddSchema>;

export const EventSetIdSchema = v.object({ id: NanoIdSchema });
export type EventSetId = v.InferOutput<typeof EventSetIdSchema>;

/** A set's label ("Set 1", "Encore"); "" for none. */
export const EventSetLabelSchema = v.object({ id: NanoIdSchema, label: LabelSchema });
export type EventSetLabel = v.InferOutput<typeof EventSetLabelSchema>;

/** The event's sets in their new order: every one of them, once each. */
export const EventSetReorderSchema = v.object({
	eventId: NanoIdSchema,
	ids: v.pipe(v.array(NanoIdSchema), v.minLength(1), v.maxLength(50)),
});
export type EventSetReorder = v.InferOutput<typeof EventSetReorderSchema>;

/** A recording session tied to the event (its tapes), or untied. */
export const EventSessionLinkSchema = v.object({
	eventId: NanoIdSchema,
	sessionId: NanoIdSchema,
	linked: v.boolean(),
});
export type EventSessionLink = v.InferOutput<typeof EventSessionLinkSchema>;
