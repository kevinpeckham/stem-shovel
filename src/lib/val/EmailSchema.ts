import * as v from "valibot";

/** An address as typed into a form: trimmed, lower-cased domain is the mail server's business. */
export const EmailSchema = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("Enter an email address."),
	v.email("That does not look like an email address."),
	v.maxLength(254, "That email address is too long."),
);

export type Email = v.InferOutput<typeof EmailSchema>;
