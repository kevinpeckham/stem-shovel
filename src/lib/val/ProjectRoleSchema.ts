import * as v from "valibot";

/**
 * Who is added to a project besides the account's owners and admins: a
 * member of the account (edits it; matters once the project is restricted)
 * or a viewer from outside the account (sees its private work, comments,
 * takes no seat).
 */
export const PROJECT_ROLES = ["member", "viewer"] as const;

export const ProjectRoleSchema = v.picklist(PROJECT_ROLES);

export type ProjectRole = v.InferOutput<typeof ProjectRoleSchema>;
