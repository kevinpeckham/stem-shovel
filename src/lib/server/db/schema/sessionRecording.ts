import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { SessionKind } from "../../../constants/sessionRecordings";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A recording of a session (docs/uploads-and-blob.md, "Sessions"): a
 * practice or a show, one audio file in Vercel Blob that the account's
 * members upload, hear and download from the account's Sessions page.
 * Filed under the account alone (a session covers many songs); its day is
 * a calendar date, not a timestamp, so it never shifts with a time zone.
 * Same reserve → upload → ready lifecycle as a demo, played as uploaded.
 */
export const sessionRecording = table(
	"session_recording",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<SessionKind>().notNull().default("practice"),
		/** Defaults to the filename minus its extension; may be emptied. */
		title: t.text("title").notNull().default(""),
		/** The day of the session, `YYYY-MM-DD`. */
		recordedOn: t.text("recorded_on").notNull(),
		/** The rehearsal room, the venue. */
		place: t.text("place").notNull().default(""),
		notes: t.text("notes").notNull().default(""),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("session_recording_account_idx").on(table.accountId),
		t.index("session_recording_day_idx").on(table.accountId, table.recordedOn),
		t.index("session_recording_uploaded_by_idx").on(table.uploadedBy),
	],
);
