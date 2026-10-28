import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import type { StemStatus } from "../../../val/StemStatusSchema";

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

/**
 * An uploaded file's columns (reserve → upload → ready): its status, the
 * blob's URL and pathname (unique; never reused), the name it was uploaded
 * under and its size in bytes.
 */
export const uploadColumns = () => ({
	status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
	url: t.text("url").notNull(),
	pathname: t.text("pathname").notNull().unique(),
	filename: t.text("filename").notNull(),
	sizeBytes: t.integer("size_bytes").notNull(),
});

/** A thumbnail the uploader's browser rendered, stored beside the file; null without one. */
export const thumbnailColumns = () => ({
	thumbnailUrl: t.text("thumbnail_url"),
	thumbnailPathname: t.text("thumbnail_pathname"),
});

/** The permanent link's secret: `/f/<code>` (nanoid, 16). */
export const shareCodeColumn = () => t.text("share_code").notNull().unique();
