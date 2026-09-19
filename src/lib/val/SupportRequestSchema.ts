import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

export const SUPPORT_STATUSES = ["open", "closed"] as const;
export const SupportStatusSchema = v.picklist(SUPPORT_STATUSES);
export type SupportStatus = v.InferOutput<typeof SupportStatusSchema>;

const EmailSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty("Enter the email address of your account."),
	v.email("That does not look like an email address."),
	v.maxLength(254),
);

/** Step 1 of /support: the email the account is registered under. */
export const SupportStartSchema = v.object({
	email: EmailSchema,
	/** A field people never see; a bot fills it. */
	website: v.optional(v.pipe(v.string(), v.maxLength(0, "")), ""),
});

/** Step 2: the challenge answer and the message. `pick` is the chosen option's index. */
export const SupportSubmitSchema = v.object({
	email: EmailSchema,
	challenge: v.pipe(v.string(), v.nonEmpty(), v.maxLength(2000)),
	pick: v.pipe(v.string(), v.regex(/^[0-9]$/, "Choose an account.")),
	message: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty("Say what you need help with."),
		v.minLength(10, "A sentence or two helps us help you."),
		v.maxLength(4000, "Keep it under 4000 characters."),
	),
	website: v.optional(v.pipe(v.string(), v.maxLength(0, "")), ""),
});

/** A signed-in user skips the challenge: their account is known. */
export const SupportSignedInSchema = v.object({
	message: SupportSubmitSchema.entries.message,
	website: v.optional(v.pipe(v.string(), v.maxLength(0, "")), ""),
});

export const SupportRequestStatusSchema = v.object({
	id: NanoIdSchema,
	status: SupportStatusSchema,
});
