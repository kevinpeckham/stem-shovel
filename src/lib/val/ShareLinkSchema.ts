import * as v from "valibot";
import { INVITE_CODE_EXPIRY_DAYS } from "./InviteCodeSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** A viewing link for one song or one project (the form sends exactly one id). */
export const ShareLinkCreateSchema = v.pipe(
	v.object({
		songId: v.optional(v.pipe(v.string(), v.trim()), ""),
		projectId: v.optional(v.pipe(v.string(), v.trim()), ""),
		note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ""),
		/** Empty = unlimited. */
		maxUses: v.optional(
			v.pipe(
				v.string(),
				v.trim(),
				v.transform((s) => (s === "" ? null : Number(s))),
				v.union([v.null(), v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000))]),
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
	}),
	v.check(
		(o) => (o.songId !== "") !== (o.projectId !== ""),
		"A share link is for one song or one project.",
	),
	v.check((o) => o.songId === "" || v.is(NanoIdSchema, o.songId), "Not a valid id."),
	v.check((o) => o.projectId === "" || v.is(NanoIdSchema, o.projectId), "Not a valid id."),
);

export const ShareLinkIdSchema = v.object({ id: NanoIdSchema });

/** Owners and admins set this on a project or a song. */
export const PrivacySchema = v.object({
	id: NanoIdSchema,
	isPrivate: v.picklist(["true", "false"]),
});

export type ShareLinkCreate = v.InferOutput<typeof ShareLinkCreateSchema>;
