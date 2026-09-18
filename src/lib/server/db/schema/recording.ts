import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { PlaybackStatus } from "../../../val/PlaybackStatusSchema";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A scratch recording made with the in-app recorder (docs/demo-recording.md):
 * a riff, a lick, a melody idea or a whole take, kept in the account's
 * library rather than on a song. Adding one to a song copies its file into
 * a `demo` of that song; the recording stays here. Same reserve → upload →
 * ready lifecycle as a demo, and the same MP3 rendition for playback.
 */
export const recording = table(
	"recording",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		/** Who recorded it; kept when they leave. */
		recordedBy: t.text("recorded_by").references(() => user.id, { onDelete: "set null" }),
		title: t.text("title").notNull(),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		/** As timed by the recorder; the browser's own files carry no duration. */
		durationSeconds: t.real("duration_seconds"),
		playbackStatus: t.text("playback_status").$type<PlaybackStatus>(),
		playbackUrl: t.text("playback_url"),
		playbackPathname: t.text("playback_pathname"),
		playbackBytes: t.integer("playback_bytes"),
		playbackStartedAt: t.integer("playback_started_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("recording_account_idx").on(table.accountId),
		t.index("recording_recorded_by_idx").on(table.recordedBy),
	],
);
