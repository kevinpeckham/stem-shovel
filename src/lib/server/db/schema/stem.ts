import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { PlaybackStatus } from "../../../val/PlaybackStatusSchema";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { songArrangement } from "./songArrangement";
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
		/**
		 * The alternate arrangement this stem belongs to (docs/arrangements.md);
		 * null for the song's own stems, its main arrangement. Every read of "the
		 * song's stems" names which it wants (`mainStems` in data.ts).
		 */
		arrangementId: t
			.text("arrangement_id")
			.references(() => songArrangement.id, { onDelete: "cascade" }),
		/** "Bass DI"; defaults to the filename minus its extension. */
		label: t.text("label").notNull(),
		sortOrder: t.integer("sort_order").notNull().default(0),
		/** The song's default mix: this stem's fader, 0..FADER_MAX (1 = unity). Members save it; listeners start from it. */
		gain: t.real("gain").notNull().default(1),
		/** The default mix's pan for this stem, -1 (left) to 1 (right); the player's knob starts here (docs/stem-engine.md, "Pan"). */
		pan: t.real("pan").notNull().default(0),
		/** The default mix's mute for this stem: saved off in an arrangement without deleting it; left out of the rendered mix. */
		muted: t.integer("muted", { mode: "boolean" }).notNull().default(false),
		/** The row's tint in the player, an id from constants/stemTints.ts, or null for none; shared with the song. */
		tint: t.text("tint"),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		/**
		 * Not unique since arrangements (docs/arrangements.md): a stem copied
		 * into another arrangement shares its file, so several rows name one
		 * blob, and a blob goes only when the last row naming it does.
		 */
		pathname: t.text("pathname").notNull(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		durationSeconds: t.real("duration_seconds"),
		channels: t.integer("channels"),
		/** The file's own rate in Hz, read from its header at upload (utils/audioSampleRate.ts) or by the metadata job; null when unknown. A stem at another rate than the song's others is marked in the player. */
		sampleRate: t.integer("sample_rate"),
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
		t.index("stem_arrangement_idx").on(table.arrangementId),
		t.index("stem_pathname_idx").on(table.pathname),
	],
);
