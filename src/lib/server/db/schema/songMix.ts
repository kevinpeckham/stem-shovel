import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { PlaybackStatus } from "../../../val/PlaybackStatusSchema";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * A mix of the song (docs/mixes.md): a stereo bounce an engineer or
 * producer sends the band for feedback, numbered within the song
 * (`version`), with the engineer's notes (markdown). One audio file in
 * Blob with the demo's reserve → upload → ready lifecycle and MP3
 * rendition; the browser reports the length and waveform peaks at upload
 * so the waveform draws at once. Feedback is comments with `mix_id`.
 */
export const songMix = table(
	"song_mix",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		/** 1, 2, … in upload order within the song. */
		version: t.integer("version").notNull(),
		/** Defaults to the filename minus its extension. */
		label: t.text("label").notNull(),
		/** The engineer's notes about the mix, markdown. */
		notes: t.text("notes").notNull().default(""),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		durationSeconds: t.real("duration_seconds"),
		/** 1024 max-abs values in 0..1 (lib/audio/peaks.ts), from the browser's decode at upload; null when it could not decode the file. */
		peaks: t.text("peaks", { mode: "json" }).$type<number[]>(),
		/** MP3 rendition for streaming and download (src/lib/server/transcode.ts); null status = not attempted. */
		playbackStatus: t.text("playback_status").$type<PlaybackStatus>(),
		playbackUrl: t.text("playback_url"),
		playbackPathname: t.text("playback_pathname"),
		playbackBytes: t.integer("playback_bytes"),
		playbackStartedAt: t.integer("playback_started_at", { mode: "timestamp_ms" }),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("song_mix_song_idx").on(table.songId, table.version),
		t.index("song_mix_account_idx").on(table.accountId),
		t.index("song_mix_uploaded_by_idx").on(table.uploadedBy),
	],
);
