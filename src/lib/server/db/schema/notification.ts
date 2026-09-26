import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { NotificationKind, NotificationPriority } from "../../../val/NotificationSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * One inbox item for one person (docs/notifications.md). `subjectId` (a
 * song, an account, a threshold) lets a burst of the same thing, new stems
 * on one song say, fold into one item with a `count`. `emailedAt` says the
 * email went (at once, or in a digest); null with an opt-in means the
 * digest still owes it.
 */
export const notification = table(
	"notification",
	{
		id: id(),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accountId: t.text("account_id").references(() => account.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<NotificationKind>().notNull(),
		priority: t.text("priority").$type<NotificationPriority>().notNull().default("normal"),
		title: t.text("title").notNull(),
		body: t.text("body").notNull().default(""),
		/** Where the item leads (a song page, account settings). */
		href: t.text("href").notNull().default(""),
		subjectId: t.text("subject_id"),
		count: t.integer("count").notNull().default(1),
		readAt: t.integer("read_at", { mode: "timestamp_ms" }),
		emailedAt: t.integer("emailed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("notification_user_idx").on(table.userId, table.readAt),
		t.index("notification_account_idx").on(table.accountId),
		t.index("notification_subject_idx").on(table.userId, table.kind, table.subjectId),
	],
);
