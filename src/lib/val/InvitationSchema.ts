import * as v from "valibot";
import { EmailSchema } from "./EmailSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Roles an account invitation can grant; ownership is not handed out by email, and viewers are invited to a project instead. */
export const INVITE_ROLES = ["admin", "member"] as const;

export const InviteRoleSchema = v.picklist(INVITE_ROLES);

export type InviteRole = v.InferOutput<typeof InviteRoleSchema>;

/** Form boundary for inviting someone into an account. */
export const InviteSchema = v.object({
	accountId: NanoIdSchema,
	email: EmailSchema,
	role: v.optional(InviteRoleSchema, "member"),
});

/** Inviting a viewer to one project (any member who may edit the project). */
export const ProjectInviteSchema = v.object({ projectId: NanoIdSchema, email: EmailSchema });

/** Form boundary for accepting or revoking by token / id. */
export const InvitationTokenSchema = v.object({ token: v.pipe(v.string(), v.minLength(20)) });
export const InvitationIdSchema = v.object({ id: NanoIdSchema });

/** Invitations last this long. */
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
