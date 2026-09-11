import * as v from "valibot";

export const MEMBER_ROLES = ["owner", "admin", "member", "viewer"] as const;

export const MemberRoleSchema = v.picklist(MEMBER_ROLES);

export type MemberRole = v.InferOutput<typeof MemberRoleSchema>;
