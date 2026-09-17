import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { PlaybackStatus } from "../../../val/PlaybackStatusSchema";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * One audio file in Vercel Blob plus what the browser learned decoding it.
 * Rows are created in `uploading` state when the upload token is issued and
 * flipped to `ready` when the client reports the decode results.
 */
export const stem = table(
	"stem",
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
		/** "Bass DI"; defaults to the filename minus its extension. */
		label: t.text("label").notNull(),
		sortOrder: t.integer("sort_order").notNull().default(0),
		/** The song's default mix: this stem's fader, 0..FADER_MAX (1 = unity). Members save it; listeners start from it. */
		gain: t.real("gain").notNull().default(1),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		durationSeconds: t.real("duration_seconds"),
		channels: t.integer("channels"),
		/** 1024 max-abs values in 0..1 (see lib/audio/peaks.ts). ~8 KB per row. */
		peaks: t.text("peaks", { mode: "json" }).$type<number[]>(),
		/**
		 * Playback rendition (AAC in M4A, src/lib/server/transcode.ts): what the
		 * player streams when `playbackStatus` is "ready"; the source file above
		 * stays the download. Null status = not attempted yet.
		 */
		playbackStatus: t.text("playback_status").$type<PlaybackStatus>(),
		playbackUrl: t.text("playback_url"),
		playbackPathname: t.text("playback_pathname"),
		playbackBytes: t.integer("playback_bytes"),
		playbackStartedAt: t.integer("playback_started_at", { mode: "timestamp_ms" }),
		/**
		 * Optional MIDI version of the stem, in Blob under `…/midi/`. `midiPathname`
		 * is set when an upload is reserved and `midiUrl` when it lands.
		 */
		midiUrl: t.text("midi_url"),
		midiPathname: t.text("midi_pathname"),
		midiFilename: t.text("midi_filename"),
		midiSizeBytes: t.integer("midi_size_bytes"),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("stem_song_sort_idx").on(table.songId, table.sortOrder),
		t.index("stem_account_idx").on(table.accountId),
	],
);
