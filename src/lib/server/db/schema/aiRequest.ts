import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * One call to a model through the AI Gateway (src/lib/server/aiDetect.ts):
 * what was asked (the text, not the audio), what came back, whether it
 * parsed, how long it took and what it cost in tokens. System admins read
 * them on /admin to see how the model is doing.
 */
export const aiRequest = table(
	"ai_request",
	{
		id: id(),
		/** What the call was for, e.g. "song-check". */
		kind: t.text("kind").notNull(),
		model: t.text("model").notNull(),
		userId: t.text("user_id").references(() => user.id, { onDelete: "set null" }),
		songId: t.text("song_id").references(() => song.id, { onDelete: "set null" }),
		/** The system prompt and user text sent (audio omitted). */
		prompt: t.text("prompt").notNull(),
		/** The model's raw reply. */
		response: t.text("response").notNull().default(""),
		/** The validated answer as JSON, when the reply parsed. */
		parsed: t.text("parsed", { mode: "json" }).$type<unknown>(),
		error: t.text("error"),
		durationMs: t.integer("duration_ms").notNull().default(0),
		inputTokens: t.integer("input_tokens"),
		outputTokens: t.integer("output_tokens"),
		...timestamps,
	},
	(table) => [
		t.index("ai_request_created_idx").on(table.createdAt),
		t.index("ai_request_user_idx").on(table.userId),
		t.index("ai_request_song_idx").on(table.songId),
	],
);
