import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { EventKind, EventStatus } from "../../../val/EventSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A show or a practice (docs/band-plan.md, "Event", phase 2): the
 * account's, on a calendar day, with its times as local wall-clock `HH:MM`
 * strings (no time zone: a time on a poster is the venue's time), where it
 * is, and the members' notes. Its sets are `event_set` rows (set lists
 * attached in order); its tapes are the `recording_session` rows that
 * point at it. The money, the house and the public page come in later
 * phases. Deleted with the account (src/lib/server/cascade.ts).
 */
export const event = table(
	"event",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<EventKind>().notNull(),
		/** A show's billing ("with The Night Shift"); empty means the venue and day. */
		title: t.text("title").notNull().default(""),
		status: t.text("status").$type<EventStatus>().notNull().default("planned"),
		/** The day, `YYYY-MM-DD`. */
		startsOn: t.text("starts_on").notNull(),
		/** Local wall-clock `HH:MM`, or "" for unset. */
		startsAt: t.text("starts_at").notNull().default(""),
		endsAt: t.text("ends_at").notNull().default(""),
		loadInAt: t.text("load_in_at").notNull().default(""),
		soundCheckAt: t.text("sound_check_at").notNull().default(""),
		venue: t.text("venue").notNull().default(""),
		address: t.text("address").notNull().default(""),
		city: t.text("city").notNull().default(""),
		/** Empty means a map search of the address, built at render time. */
		mapUrl: t.text("map_url").notNull().default(""),
		/** Parking, the back door, the house engineer's name. */
		venueNotes: t.text("venue_notes").notNull().default(""),
		/** Markdown, members only: the plan for the night, then how it went. */
		notes: t.text("notes").notNull().default(""),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("event_account_idx").on(table.accountId),
		t.index("event_day_idx").on(table.accountId, table.startsOn),
		t.index("event_created_by_idx").on(table.createdBy),
	],
);
