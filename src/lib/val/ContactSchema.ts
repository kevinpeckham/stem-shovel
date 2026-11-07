import * as v from "valibot";
import { boundedText } from "./BoundedTextSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** A contact's name (docs/band-plan.md, "The band directory"): required; two of the same name are fine. */
export const ContactNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Give the contact a name."),
	v.maxLength(160, "Keep the name under 160 characters."),
);
/** What they do for the band, as free text ("Promoter", "Booking agent"). */
export const ContactRoleSchema = boundedText(80, "role");
export const ContactPhoneSchema = boundedText(60, "phone number");
/** An email address, or "" for none. */
export const ContactEmailSchema = v.pipe(
	v.string(),
	v.trim(),
	v.union([
		v.literal(""),
		v.pipe(
			v.string(),
			v.email("Enter an email address."),
			v.maxLength(200, "Keep the email under 200 characters."),
		),
	]),
);
export const ContactAddressSchema = boundedText(300, "address");
/** The band's notes on them: how they like to be reached, what they paid last time. */
export const ContactNotesSchema = boundedText(2000, "notes");

/** A contact picked as a show's promoter, or "" for none. */
export const ContactRefSchema = v.union([v.literal(""), NanoIdSchema]);

/** A contact's fields past the name, each defaulting to "". */
const contactEntries = {
	name: ContactNameSchema,
	role: v.optional(ContactRoleSchema, ""),
	phone: v.optional(ContactPhoneSchema, ""),
	email: v.optional(ContactEmailSchema, ""),
	address: v.optional(ContactAddressSchema, ""),
	notes: v.optional(ContactNotesSchema, ""),
};

/** A new contact in the account. */
export const ContactCreateSchema = v.object({ accountId: NanoIdSchema, ...contactEntries });
export type ContactCreate = v.InferOutput<typeof ContactCreateSchema>;

/** A contact's name, role, phone, email, address and notes. */
export const ContactUpdateSchema = v.object({ id: NanoIdSchema, ...contactEntries });
export type ContactUpdate = v.InferOutput<typeof ContactUpdateSchema>;
/** The fields a contact write takes: everything but the id. */
export type ContactFields = Omit<ContactUpdate, "id">;

export const ContactIdSchema = v.object({ id: NanoIdSchema });
