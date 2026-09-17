import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** Where a waitlist entry stands: pending until the address is confirmed; invited once a code went out. */
export const WAITLIST_STATUSES = ["pending", "confirmed", "invited", "removed"] as const;
export const WaitlistStatusSchema = v.picklist(WAITLIST_STATUSES);
export type WaitlistStatus = v.InferOutput<typeof WaitlistStatusSchema>;

const EmailSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty("Enter your email address."),
	v.email("That does not look like an email address."),
	v.maxLength(254),
);

/**
 * The public sign-up form. `updates` is the consent to project-update email
 * (off by default: waitlist mail alone is always sent). `website` is a
 * honeypot: humans never see it, so anything in it is a bot.
 */
export const WaitlistJoinSchema = v.object({
	email: EmailSchema,
	name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ""),
	updates: v.optional(v.boolean(), false),
	website: v.optional(v.pipe(v.string(), v.maxLength(0, "No thanks.")), ""),
});

/** The one-time tokens in the confirmation and manage links. */
export const WaitlistTokenSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{32}$/));

/** The manage page: turn project updates on or off, or leave the list. */
export const WaitlistPrefsSchema = v.object({
	token: WaitlistTokenSchema,
	action: v.picklist(["updates-on", "updates-off", "leave"]),
});

/** A system admin acting on one entry from /admin/waitlist. */
export const WAITLIST_ACTIONS = ["invite", "resend", "remove"] as const;
export const WaitlistAdminSchema = v.object({
	id: NanoIdSchema,
	action: v.picklist(WAITLIST_ACTIONS),
});
