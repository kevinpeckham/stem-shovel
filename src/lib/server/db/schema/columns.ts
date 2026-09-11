import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

// SQLite stores these as integer milliseconds; Drizzle maps them to Date.
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** Text primary key, generated in the app with nanoid (21 chars). */
export const id = () =>
	t
		.text("id")
		.primaryKey()
		.$defaultFn(() => nanoid());

export const timestamps = {
	createdAt: t.integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
	updatedAt: t
		.integer("updated_at", { mode: "timestamp_ms" })
		.default(nowMs)
		.$onUpdate(() => new Date())
		.notNull(),
};
