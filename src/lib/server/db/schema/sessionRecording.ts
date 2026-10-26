import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { SessionDevice } from "../../../val/SessionRecordingSchema";
import type { PlaybackStatus } from "../../../val/PlaybackStatusSchema";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * One recording of a session (docs/uploads-and-blob.md, "Sessions"): an
 * audio file in Vercel Blob that a member uploaded, belonging to a
 * `recording_session` (a practice or a show) of the account. Its day is
 * the file's own date (the recorder's, not the upload's), a calendar date
 * so it never shifts with a time zone; it may be the session's day or the
 * day after. Same reserve → upload → ready lifecycle as a demo, with the
 * same MP3 rendition for playback and the session's download.
 */
export const sessionRecording = table(
	"session_recording",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		/** The session it belongs to (recording_session). */
		sessionId: t.text("session_id").notNull().default(""),
		/** Defaults to the filename minus its extension; may be emptied. */
		title: t.text("title").notNull().default(""),
		/** The day it was recorded, `YYYY-MM-DD`. */
		recordedOn: t.text("recorded_on").notNull(),
		notes: t.text("notes").notNull().default(""),
		/** Where it was captured ("Kevin's phone", "Room mic"): tells apart recordings of one performance from several devices; empty for unknown. */
		source: t.text("source").notNull().default(""),
		/** What kind of device captured it ("phone", "soundboard"…; labels in constants/sessionRecordings.ts), shown with `source` as the input's name; "" for unset. */
		device: t.text("device").$type<SessionDevice>().notNull().default(""),
		/** The song it is a recording of, when the band says so (one of the account's); a practice's tape may cover a set, so most have none. */
		songId: t.text("song_id").references(() => song.id, { onDelete: "set null" }),
		/** Anyone with its page's address may listen and download (docs/uploads-and-blob.md, "Sessions": public recordings). Off by default: the tapes are the band's. */
		isPublic: t.integer("is_public", { mode: "boolean" }).notNull().default(false),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		/** MP3 rendition for playback and the session's download (src/lib/server/transcode.ts); null status = not attempted. */
		playbackStatus: t.text("playback_status").$type<PlaybackStatus>(),
		playbackUrl: t.text("playback_url"),
		playbackPathname: t.text("playback_pathname"),
		playbackBytes: t.integer("playback_bytes"),
		playbackStartedAt: t.integer("playback_started_at", { mode: "timestamp_ms" }),
		/** The MP3's length in seconds and 1024 max-abs values in 0..1 of it (lib/audio/peaks.ts), measured in the jobs function after the render; null until then, `peaksStartedAt` the claim on the measuring. */
		durationSeconds: t.real("duration_seconds"),
		peaks: t.text("peaks", { mode: "json" }).$type<number[]>(),
		peaksStartedAt: t.integer("peaks_started_at", { mode: "timestamp_ms" }),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("session_recording_account_idx").on(table.accountId),
		t.index("session_recording_session_idx").on(table.sessionId),
		t.index("session_recording_day_idx").on(table.accountId, table.recordedOn),
		t.index("session_recording_uploaded_by_idx").on(table.uploadedBy),
		t.index("session_recording_song_idx").on(table.songId),
	],
);
