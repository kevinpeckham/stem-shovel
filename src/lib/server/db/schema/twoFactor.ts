import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id } from "./columns";
import { user } from "./user";

/**
 * Better Auth's `twoFactor` plugin model (replicator's shape): the TOTP
 * secret and hashed backup codes per user, plus the lockout counters the
 * plugin writes after failed attempts. Never read by the app itself.
 */
export const twoFactor = table(
	"two_factor",
	{
		id: id(),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		secret: t.text("secret").notNull(),
		backupCodes: t.text("backup_codes").notNull(),
		verified: t.integer("verified", { mode: "boolean" }).notNull().default(true),
		failedVerificationCount: t.integer("failed_verification_count").notNull().default(0),
		lockedUntil: t.integer("locked_until", { mode: "timestamp_ms" }),
	},
	(table) => [t.index("two_factor_user_idx").on(table.userId)],
);
