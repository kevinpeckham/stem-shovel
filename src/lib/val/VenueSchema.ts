import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** Trimmed text of at most `max` characters. */
const bounded = (max: number, what: string) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(max, `Keep the ${what} under ${max.toLocaleString("en-US")} characters.`),
	);

/** A venue's name (docs/band-plan.md, "Event"): required. */
export const VenueNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Give the venue a name."),
	v.maxLength(160, "Keep the name under 160 characters."),
);
export const VenueAddressSchema = bounded(300, "address");
export const VenueCitySchema = bounded(120, "city");
/** The band's own notes on a venue: parking, the back door, the house engineer. */
export const VenueNotesSchema = bounded(2000, "notes");
/** The band's contact at a venue: a name, a phone, an email, free text. */
export const VenueContactSchema = bounded(500, "contact");

/** A map link, https only (it is rendered as a link), or "" for a search of the address built at render time. */
export const VenueMapUrlSchema = v.pipe(
	v.string(),
	v.trim(),
	v.union([
		v.literal(""),
		v.pipe(
			v.string(),
			v.url("Enter a full address, like https://maps.example.com/…"),
			v.startsWith("https://", "Use an https:// address."),
		),
	]),
	v.maxLength(500, "Keep the map link under 500 characters."),
);
/** A venue's website: https only (it is rendered as a link), or "". */
export const VenueWebsiteUrlSchema = v.pipe(
	v.string(),
	v.trim(),
	v.union([
		v.literal(""),
		v.pipe(
			v.string(),
			v.url("Enter a full address, like https://example.com"),
			v.startsWith("https://", "Use an https:// address."),
		),
	]),
	v.maxLength(500, "Keep the website under 500 characters."),
);
/** `VenueMapUrlSchema`, "" when left out. */
export const MapUrlSchema = v.optional(VenueMapUrlSchema, "");

/** A venue picked for an event, or "" for none. */
export const VenueRefSchema = v.union([v.literal(""), NanoIdSchema]);

/** A new venue in the shared directory, put on the account's list. */
export const VenueCreateSchema = v.object({
	accountId: NanoIdSchema,
	name: VenueNameSchema,
	address: v.optional(VenueAddressSchema, ""),
	city: v.optional(VenueCitySchema, ""),
	mapUrl: MapUrlSchema,
	websiteUrl: v.optional(VenueWebsiteUrlSchema, ""),
});
export type VenueCreate = v.InferOutput<typeof VenueCreateSchema>;

/** A venue's shared facts: anyone signed in may correct them. */
export const VenueUpdateSchema = v.object({
	id: NanoIdSchema,
	name: VenueNameSchema,
	address: v.optional(VenueAddressSchema, ""),
	city: v.optional(VenueCitySchema, ""),
	mapUrl: MapUrlSchema,
	websiteUrl: v.optional(VenueWebsiteUrlSchema, ""),
});
export type VenueUpdate = v.InferOutput<typeof VenueUpdateSchema>;
/** The fields `updateVenue` writes: everything but the id. */
export type VenueFields = Omit<VenueUpdate, "id">;

/** What is the account's own about a venue: its notes and its contact there. */
export const VenueLocalSchema = v.object({
	accountId: NanoIdSchema,
	venueId: NanoIdSchema,
	notes: v.optional(VenueNotesSchema, ""),
	contact: v.optional(VenueContactSchema, ""),
});
export type VenueLocal = v.InferOutput<typeof VenueLocalSchema>;

/** A venue on (or off) the account's list. */
export const VenueLinkSchema = v.object({ accountId: NanoIdSchema, venueId: NanoIdSchema });
export type VenueLink = v.InferOutput<typeof VenueLinkSchema>;

/** A search of the shared directory by name or city; "" finds nothing. */
export const VenueSearchSchema = v.object({
	q: v.optional(bounded(160, "search"), ""),
});
export type VenueSearch = v.InferOutput<typeof VenueSearchSchema>;

export const VenueIdSchema = v.object({ id: NanoIdSchema });
export type VenueId = v.InferOutput<typeof VenueIdSchema>;
