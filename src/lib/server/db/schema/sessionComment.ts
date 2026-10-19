import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { sessionRecording } from "./sessionRecording";
import { user } from "./user";

/**
 * A comment on a session's recording (docs/uploads-and-blob.md, "Sessions"
 * review) by a member of the account: a title, plain text and optionally a
 * position in the recording (`at`, seconds) so it sits on the waveform, as
 * a song's comments do. `editedAt` marks a comment changed after it was
 * posted. Deleted with the recording, the session, the account and the
 * author (cascade.ts).
 */
export const sessionComment = table(
	"session_comment",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		recordingId: t
			.text("recording_id")
			.notNull()
			.references(() => sessionRecording.id, { onDelete: "cascade" }),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: t.text("title").notNull(),
		body: t.text("body").notNull(),
		at: t.real("at"),
		editedAt: t.integer("edited_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("session_comment_account_idx").on(table.accountId),
		t.index("session_comment_recording_idx").on(table.recordingId, table.createdAt),
		t.index("session_comment_user_idx").on(table.userId),
	],
);
