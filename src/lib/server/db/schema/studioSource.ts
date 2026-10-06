import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { StemStatus } from "../../../val/StemStatusSchema";
import type { StudioSourceKind } from "../../../val/StudioSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { idea } from "./idea";
import { user } from "./user";

/**
 * One audio file a Studio arrangement can cut clips from
 * (docs/multitrack-recorder.md, "Data model"): a take recorded on a track,
 * an imported file or a bounce, under a song (an idea of kind "song").
 * Sources are append-only — deleting a clip never deletes its source, so
 * every revision stays restorable. Same reserve → upload → ready lifecycle
 * as a take, in the recordings store; no playback rendition, since the
 * editor needs the lossless file.
 */
export const studioSource = table(
	"studio_source",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		ideaId: t
			.text("idea_id")
			.notNull()
			.references(() => idea.id, { onDelete: "cascade" }),
		/** Who recorded or imported it; kept when they leave. */
		recordedBy: t.text("recorded_by").references(() => user.id, { onDelete: "set null" }),
		kind: t.text("kind").$type<StudioSourceKind>().notNull().default("take"),
		/** The recording pass it came from (several sources share one); 0 for an import or a bounce. */
		takeNumber: t.integer("take_number").notNull().default(0),
		/** The track it was recorded on ("Guitar"), or the file's name: "Take 3 · Guitar" in the list. */
		trackLabel: t.text("track_label").notNull(),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		/** pcm for the WAV the Studio writes, flac once the jobs function converts it; null for an import until decoded. */
		codec: t.text("codec"),
		/** The context's rate when it was recorded; a source at another rate is resampled on load. */
		sampleRate: t.integer("sample_rate").notNull(),
		channels: t.integer("channels").notNull().default(1),
		durationSeconds: t.real("duration_seconds").notNull().default(0),
		/** 1024 max-abs values in 0..1 (lib/audio/peaks.ts), as stem.peaks; null until the browser reports them. */
		peaks: t.text("peaks", { mode: "json" }).$type<number[]>(),
		...timestamps,
	},
	(table) => [
		t.index("studio_source_account_idx").on(table.accountId),
		t.index("studio_source_idea_idx").on(table.ideaId),
		t.index("studio_source_recorded_by_idx").on(table.recordedBy),
	],
);
