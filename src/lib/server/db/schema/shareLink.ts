import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { project } from "./project";
import { recordingSession } from "./recordingSession";
import { sessionRecording } from "./sessionRecording";
import { song } from "./song";
import { songMix } from "./songMix";
import { user } from "./user";

/**
 * A viewing code for a private song, project, session or session recording
 * (exactly one is set; a project code opens every song in it, a session
 * code every recording of the session). Any member makes one; the
 * link is the page's URL with `?share=<code>`, and the code is remembered
 * in a cookie for the rest of the visit. It grants viewing only.
 */
export const shareLink = table(
	"share_link",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		projectId: t.text("project_id").references(() => project.id, { onDelete: "cascade" }),
		songId: t.text("song_id").references(() => song.id, { onDelete: "cascade" }),
		/** A link made for a mix (docs/mixes.md): the song page opens on it. */
		mixId: t.text("mix_id").references(() => songMix.id, { onDelete: "set null" }),
		/** A link for one session recording (docs/uploads-and-blob.md, "Sessions"): opens its own page, members-only otherwise. */
		recordingId: t
			.text("recording_id")
			.references(() => sessionRecording.id, { onDelete: "cascade" }),
		/** A link for a whole session (docs/uploads-and-blob.md, "Sessions"): opens the session's page with every recording of it. */
		sessionId: t.text("session_id").references(() => recordingSession.id, { onDelete: "cascade" }),
		code: t.text("code").notNull().unique(),
		note: t.text("note").notNull().default(""),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		/** null = never expires. */
		expiresAt: t.integer("expires_at", { mode: "timestamp_ms" }),
		/** null = unlimited; a use is a visitor's first arrival with the code. */
		maxUses: t.integer("max_uses"),
		uses: t.integer("uses").notNull().default(0),
		revokedAt: t.integer("revoked_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("share_link_account_idx").on(table.accountId),
		t.index("share_link_project_idx").on(table.projectId),
		t.index("share_link_song_idx").on(table.songId),
		t.index("share_link_recording_idx").on(table.recordingId),
		t.index("share_link_session_idx").on(table.sessionId),
		t.index("share_link_created_by_idx").on(table.createdBy),
	],
);
