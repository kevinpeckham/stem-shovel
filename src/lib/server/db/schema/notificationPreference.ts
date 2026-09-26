import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { DigestMode } from "../../../val/NotificationSchema";
import { timestamps } from "./columns";
import { user } from "./user";

/**
 * How one person wants to hear about things beyond the inbox
 * (docs/notifications.md): the email opt-ins, off until switched on; the
 * digest that gathers them; and the text-message hook, which nothing sends
 * to yet. A person without a row has the defaults.
 */
export const notificationPreference = table("notification_preference", {
	userId: t
		.text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	emailComments: t.integer("email_comments", { mode: "boolean" }).notNull().default(false),
	emailStems: t.integer("email_stems", { mode: "boolean" }).notNull().default(false),
	emailSongs: t.integer("email_songs", { mode: "boolean" }).notNull().default(false),
	emailDemos: t.integer("email_demos", { mode: "boolean" }).notNull().default(false),
	digest: t.text("digest").$type<DigestMode>().notNull().default("none"),
	/** When the last digest went, so the next is due a day or a week later. */
	digestSentAt: t.integer("digest_sent_at", { mode: "timestamp_ms" }),
	/** The hook for text messages: a number and a switch; deliverSms (src/lib/server/notifications.ts) does nothing yet. */
	smsNumber: t.text("sms_number"),
	smsEnabled: t.integer("sms_enabled", { mode: "boolean" }).notNull().default(false),
	...timestamps,
});
