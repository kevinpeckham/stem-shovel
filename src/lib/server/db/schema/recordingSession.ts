import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { SessionKind } from "../../../constants/sessionRecordings";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A session (docs/uploads-and-blob.md, "Sessions"): one practice or one
 * show, which the recordings of that evening belong to (`session_recording`
 * rows, each one audio file). Named by the band ("Battle of the Bands") or,
 * with no name, called after its place and day. It starts on a calendar
 * day and may run into the next (a show past midnight), never further.
 * `recording_session` and not `session`: Better Auth's sign-in sessions
 * have that table.
 */
export const recordingSession = table(
	"recording_session",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<SessionKind>().notNull().default("practice"),
		/** The band's own name for it; empty means "place · day" (utils/sessionName.ts). */
		name: t.text("name").notNull().default(""),
		/** The day it starts, `YYYY-MM-DD`; a recording may be of this day or the next. */
		startsOn: t.text("starts_on").notNull(),
		/** The rehearsal room, the venue. */
		place: t.text("place").notNull().default(""),
		notes: t.text("notes").notNull().default(""),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("recording_session_account_idx").on(table.accountId),
		t.index("recording_session_day_idx").on(table.accountId, table.startsOn),
		t.index("recording_session_created_by_idx").on(table.createdBy),
	],
);
