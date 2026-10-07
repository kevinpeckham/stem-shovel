import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { recording } from "./recording";

/**
 * One source of a take (docs/demo-recording.md, "Takes with sources"): a
 * layer of a loop saved from the looper, kept beside the take's mix so the
 * take can go to a song as stems (until 2026-10-07 the Idea Recorder also
 * made these, as a multitrack take; that is the Studio's job now). Same
 * reserve → upload → ready lifecycle as the take, under the take's account
 * and store; no playback rendition of its own (a stem made from it gets one).
 */
export const recordingStem = table(
	"recording_stem",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		recordingId: t
			.text("recording_id")
			.notNull()
			.references(() => recording.id, { onDelete: "cascade" }),
		/** "Microphone", "Piano", "Drums": the stem's label when it joins a song. */
		label: t.text("label").notNull(),
		sortOrder: t.integer("sort_order").notNull().default(0),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		/** As the browser reported (src/lib/constants/recordingCodecs.ts). */
		codec: t.text("codec"),
		/** As timed by the recorder. */
		durationSeconds: t.real("duration_seconds"),
		...timestamps,
	},
	(table) => [
		t.index("recording_stem_account_idx").on(table.accountId),
		t.index("recording_stem_recording_idx").on(table.recordingId),
	],
);
