import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { AccountStatus } from "../../../val/AccountStatusSchema";
import { id, timestamps } from "./columns";

/**
 * The tenant: a studio, band or client workspace. Everything else belongs to
 * an account and every query is scoped by one. The id is also the top-level
 * folder in the Blob store (`accounts/<id>/…`).
 */
export const account = table("account", {
	id: id(),
	name: t.text("name").notNull(),
	slug: t.text("slug").notNull().unique(),
	status: t.text("status").$type<AccountStatus>().notNull().default("active"),
	/** null = unlimited. Checked when a stem upload token is issued. */
	storageLimitBytes: t.integer("storage_limit_bytes"),
	...timestamps,
});
