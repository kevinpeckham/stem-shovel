import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { InviteRole } from "../../../val/InvitationSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A reusable code that lets someone sign up (sign-up is otherwise closed).
 * With an account it also joins them to it: owners and admins generate
 * those from account settings. Without one (`accountId` null) it only
 * opens sign-up — the newcomer gets their own workspace — and only a
 * system admin (/admin) can mint it. `maxUses` null means unlimited,
 * `expiresAt` null never expires, and `revokedAt` closes it early.
 */
export const inviteCode = table(
	"invite_code",
	{
		id: id(),
		accountId: t.text("account_id").references(() => account.id, { onDelete: "cascade" }),
		code: t.text("code").notNull().unique(),
		role: t.text("role").$type<InviteRole>().notNull().default("member"),
		/** A label for the settings list, e.g. who it is for. */
		note: t.text("note").notNull().default(""),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		maxUses: t.integer("max_uses"),
		uses: t.integer("uses").notNull().default(0),
		expiresAt: t.integer("expires_at", { mode: "timestamp_ms" }),
		revokedAt: t.integer("revoked_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("invite_code_account_idx").on(table.accountId),
		t.index("invite_code_created_by_idx").on(table.createdBy),
	],
);
