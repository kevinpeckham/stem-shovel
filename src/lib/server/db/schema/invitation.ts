import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { MemberRole } from "../../../val/MemberRoleSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * An invitation to join an account, sent by email with a one-time token
 * (`/invite/<token>`). Accepting creates the membership; `acceptedAt` or
 * `revokedAt` closes it.
 */
export const invitation = table(
	"invitation",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		email: t.text("email").notNull(),
		role: t.text("role").$type<MemberRole>().notNull().default("member"),
		token: t.text("token").notNull().unique(),
		invitedBy: t.text("invited_by").references(() => user.id, { onDelete: "set null" }),
		expiresAt: t.integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		acceptedAt: t.integer("accepted_at", { mode: "timestamp_ms" }),
		revokedAt: t.integer("revoked_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("invitation_account_idx").on(table.accountId),
		t.index("invitation_email_idx").on(table.email),
	],
);
