import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";
import { CreditRoleSchema } from "./CreditRoleSchema";
import { EmailSchema } from "./EmailSchema";
import { InviteRoleSchema } from "./InvitationSchema";

/** An artist's name as typed: the account's directory matches it case-insensitively. */
export const ArtistNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("Give the artist a name."),
	v.maxLength(120, "Keep the name under 120 characters."),
);

/** Credit an artist (by name; found in the account's directory or created) on a song in a role. */
export const SongCreditAddSchema = v.object({
	songId: NanoIdSchema,
	role: CreditRoleSchema,
	name: ArtistNameSchema,
});

export type SongCreditAdd = v.InferOutput<typeof SongCreditAddSchema>;

/** A web address, or nothing. */
export const WebsiteSchema = v.optional(
	v.pipe(
		v.string(),
		v.trim(),
		v.union([
			v.literal(""),
			v.pipe(v.string(), v.url("Enter a full address, like https://example.com.")),
		]),
		v.maxLength(500),
	),
	"",
);

/** The artist's own details, from its page. */
export const ArtistUpdateSchema = v.object({
	id: NanoIdSchema,
	name: ArtistNameSchema,
	sortName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), ""),
	website: WebsiteSchema,
	note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)), ""),
});

/** A person added to an artist: a name, what they do, an email when known. */
export const ArtistMemberAddSchema = v.object({
	artistId: NanoIdSchema,
	name: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty("Give the person a name."),
		v.maxLength(120, "Keep the name under 120 characters."),
	),
	role: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), ""),
	email: v.optional(v.union([v.literal(""), EmailSchema]), ""),
});

/** Invite an artist's member (by their recorded email) into the account. */
export const ArtistMemberInviteSchema = v.object({
	id: NanoIdSchema,
	role: v.optional(InviteRoleSchema, "member"),
});
