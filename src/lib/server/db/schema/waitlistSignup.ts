import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { WaitlistStatus } from "../../../val/WaitlistSchema";
import { id, timestamps } from "./columns";
import { inviteCode } from "./inviteCode";

/**
 * The beta waitlist (docs/auth.md): an address that asked for an invite
 * code, confirmed by a link in an email (double opt-in). `updatesOk` is the
 * separate consent to project-update email; waitlist mail (the confirmation,
 * the invite) is always sent. The manage token in every email lets them
 * change the consent or leave. System admins send invites from /admin.
 */
export const waitlistSignup = table(
	"waitlist_signup",
	{
		id: id(),
		email: t.text("email").notNull().unique(),
		name: t.text("name").notNull().default(""),
		updatesOk: t.integer("updates_ok", { mode: "boolean" }).notNull().default(false),
		status: t.text("status").$type<WaitlistStatus>().notNull().default("pending"),
		confirmToken: t.text("confirm_token").notNull().unique(),
		manageToken: t.text("manage_token").notNull().unique(),
		confirmedAt: t.integer("confirmed_at", { mode: "timestamp_ms" }),
		invitedAt: t.integer("invited_at", { mode: "timestamp_ms" }),
		inviteCodeId: t
			.text("invite_code_id")
			.references(() => inviteCode.id, { onDelete: "set null" }),
		/** Where they signed up (the page path). */
		source: t.text("source").notNull().default(""),
		...timestamps,
	},
	(table) => [
		t.index("waitlist_status_idx").on(table.status, table.createdAt),
		t.index("waitlist_invite_code_idx").on(table.inviteCodeId),
	],
);
