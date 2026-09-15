import * as v from "valibot";
import { normalizeInviteCode } from "../utils/normalizeInviteCode";
import { InviteRoleSchema } from "./InvitationSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Characters a generated code is made of: no 0/O, 1/I/L, so it reads and types cleanly. */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 12;

/** How long a code lasts when the form asks for a limit (days). */
export const INVITE_CODE_EXPIRY_DAYS = [0, 7, 30, 90] as const;

/** A typed code, normalised: separators and case do not matter. */
export const InviteCodeSchema = v.pipe(
	v.string(),
	v.transform(normalizeInviteCode),
	v.length(INVITE_CODE_LENGTH, "An invite code has 12 letters and digits."),
);

/** Form boundary for generating a code (owners and admins). */
export const InviteCodeCreateSchema = v.object({
	accountId: NanoIdSchema,
	role: v.optional(InviteRoleSchema, "member"),
	note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ""),
	/** Empty = unlimited. */
	maxUses: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.transform((s) => (s === "" ? null : Number(s))),
			v.union([v.null(), v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000))]),
		),
		"",
	),
	/** Days until it expires; 0 = never. */
	expiresDays: v.optional(
		v.pipe(
			v.string(),
			v.transform(Number),
			v.picklist(INVITE_CODE_EXPIRY_DAYS, "Pick one of the offered durations."),
		),
		"0",
	),
});

/** A system admin's code: opens sign-up only, so no account and no role. */
export const SystemInviteCodeCreateSchema = v.omit(InviteCodeCreateSchema, ["accountId", "role"]);

export const InviteCodeIdSchema = v.object({ id: NanoIdSchema });

export type InviteCodeCreate = v.InferOutput<typeof InviteCodeCreateSchema>;
