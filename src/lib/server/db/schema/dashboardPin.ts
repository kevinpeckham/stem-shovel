import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { DashboardPinKind } from "../../../val/DashboardPinSchema";
import { account } from "./account";
import { timestamps } from "./columns";
import { user } from "./user";

/**
 * One thing a person pinned to their own dashboard (docs/dashboard-plan.md,
 * step 5): a song, a project, a recording session or a set list, by kind
 * and id, with the account it belongs to so a tenant's deletion sweeps it.
 * The pin is the person's, never the band's. Deleted with the user, the target and
 * the account (src/lib/server/cascade.ts).
 */
export const dashboardPin = table(
	"dashboard_pin",
	{
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<DashboardPinKind>().notNull(),
		targetId: t.text("target_id").notNull(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		...timestamps,
	},
	(table) => [
		t.primaryKey({ columns: [table.userId, table.kind, table.targetId] }),
		t.index("dashboard_pin_target_idx").on(table.targetId),
		t.index("dashboard_pin_account_idx").on(table.accountId),
	],
);
