import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A super admin acting inside an account they do not belong to (docs/security.md):
 * who, where, and which request. Written from requireMember whenever an
 * acting membership is used, so every page load and mutation under that
 * power leaves a line. Read on /admin.
 */
export const auditLog = table(
	"audit_log",
	{
		id: id(),
		userId: t.text("user_id").references(() => user.id, { onDelete: "set null" }),
		accountId: t.text("account_id").references(() => account.id, { onDelete: "set null" }),
		/** `METHOD path` of the request, e.g. `POST /_app/remote/…/updateSong`. */
		action: t.text("action").notNull(),
		...timestamps,
	},
	(table) => [
		t.index("audit_log_created_idx").on(table.createdAt),
		t.index("audit_log_user_idx").on(table.userId),
		t.index("audit_log_account_idx").on(table.accountId),
	],
);
