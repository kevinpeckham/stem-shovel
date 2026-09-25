import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ProjectRole } from "../../../val/ProjectRoleSchema";
import { id, timestamps } from "./columns";
import { project } from "./project";
import { user } from "./user";

/**
 * People added to one project: an account member added to a restricted
 * project, or a viewer invited from outside the account (docs/auth.md).
 */
export const projectMember = table(
	"project_member",
	{
		id: id(),
		projectId: t
			.text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: t.text("role").$type<ProjectRole>().notNull().default("viewer"),
		addedBy: t.text("added_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("project_member_project_idx").on(table.projectId),
		t.index("project_member_user_idx").on(table.userId),
		t.index("project_member_added_by_idx").on(table.addedBy),
		t.unique("project_member_unique").on(table.projectId, table.userId),
	],
);
