import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { SupportStatus } from "../../../val/SupportRequestSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A support request from /support, open to signed-out visitors (the trouble
 * may be sign-in itself). The sender proved the email is an account's by
 * picking their account out of a line-up of obscured names
 * (src/lib/server/supportChallenge.ts), or was signed in. System admins read,
 * close and delete them on /admin and get an email when one comes in.
 */
export const supportRequest = table(
	"support_request",
	{
		id: id(),
		email: t.text("email").notNull(),
		userId: t.text("user_id").references(() => user.id, { onDelete: "set null" }),
		accountId: t.text("account_id").references(() => account.id, { onDelete: "set null" }),
		message: t.text("message").notNull(),
		/** How the sender was verified: "signed-in" or "challenge". */
		verifiedBy: t.text("verified_by").notNull(),
		ipAddress: t.text("ip_address").notNull().default(""),
		userAgent: t.text("user_agent").notNull().default(""),
		status: t.text("status").$type<SupportStatus>().notNull().default("open"),
		closedAt: t.integer("closed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("support_request_user_idx").on(table.userId),
		t.index("support_request_account_idx").on(table.accountId),
		t.index("support_request_status_idx").on(table.status, table.createdAt),
	],
);
