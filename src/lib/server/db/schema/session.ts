import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { timestamps } from "./columns";
import { user } from "./user";

/** Better Auth session. */
export const session = table(
	"session",
	{
		id: t.text("id").primaryKey(),
		token: t.text("token").notNull().unique(),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		expiresAt: t.integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		ipAddress: t.text("ip_address"),
		userAgent: t.text("user_agent"),
		...timestamps,
	},
	(table) => [t.index("session_user_idx").on(table.userId)],
);
