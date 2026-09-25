import * as v from "valibot";

/** Roles in an account. Viewers live on projects (src/lib/val/ProjectRoleSchema.ts), not here. */
export const MEMBER_ROLES = ["owner", "admin", "member"] as const;

export const MemberRoleSchema = v.picklist(MEMBER_ROLES);

export type MemberRole = v.InferOutput<typeof MemberRoleSchema>;
