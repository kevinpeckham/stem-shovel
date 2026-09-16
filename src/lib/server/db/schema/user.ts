import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";

/**
 * A person who signs in. Column set matches Better Auth's core `user` model
 * (name, email, emailVerified, image, timestamps) so adopting it later adds
 * its own tables without touching this one.
 */
export const user = table("user", {
	id: id(),
	name: t.text("name").notNull(),
	email: t.text("email").notNull().unique(),
	emailVerified: t.integer("email_verified", { mode: "boolean" }).default(false).notNull(),
	image: t.text("image"),
	isActive: t.integer("is_active", { mode: "boolean" }).default(true).notNull(),
	/** Operator of the whole app (/admin): set by `bun run db:system-admin <email>`, never from a request. */
	isSystemAdmin: t.integer("is_system_admin", { mode: "boolean" }).default(false).notNull(),
	/** Acts as owner of every account (audited); `bun run db:super-admin <email>`. */
	isSuperAdmin: t.integer("is_super_admin", { mode: "boolean" }).default(false).notNull(),
	/** Better Auth's twoFactor plugin flips this; the secret lives in `two_factor`. */
	twoFactorEnabled: t.integer("two_factor_enabled", { mode: "boolean" }).default(false).notNull(),
	...timestamps,
});
