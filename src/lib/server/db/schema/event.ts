import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { EventKind, EventStatus } from "../../../val/EventSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { practiceLocation } from "./practiceLocation";
import { user } from "./user";
import { venue as venueTable } from "./venue";

/**
 * A show or a practice (docs/band-plan.md, "Event", phase 2): the
 * account's, on a calendar day, with its times as local wall-clock `HH:MM`
 * strings (no time zone: a time on a poster is the venue's time), where it
 * is, and the members' notes. Its sets are `event_set` rows (set lists
 * attached in order); its tapes are the `recording_session` rows that
 * point at it. The money (the books) is on the row,
 * its payouts `event_payout` rows; the house and the public page come in
 * later phases. Deleted with the account (src/lib/server/cascade.ts).
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
		/** Where it is: the account's venue (docs/band-plan.md, "Event"); null for none. */
		venueId: t.text("venue_id").references(() => venueTable.id, { onDelete: "set null" }),
		/** Where a practice is: the account's practice location; null for none (a show's is `venueId`). */
		locationId: t
			.text("location_id")
			.references(() => practiceLocation.id, { onDelete: "set null" }),
		/** Legacy free text from before venues were their own rows: no longer written, shown only when `venueId` is null. */
		venue: t.text("venue").notNull().default(""),
		address: t.text("address").notNull().default(""),
		city: t.text("city").notNull().default(""),
		/** Empty means a map search of the address, built at render time. */
		mapUrl: t.text("map_url").notNull().default(""),
		/** Parking, the back door, the house engineer's name (legacy: now `venue.notes`). */
		venueNotes: t.text("venue_notes").notNull().default(""),
		/** Markdown, members only: the plan for the night, then how it went. */
		notes: t.text("notes").notNull().default(""),
		/** The books (docs/band-plan.md, phase 4): the ticket price as free text ("$10 adv / $12 door"). */
		ticketPrice: t.text("ticket_price").notNull().default(""),
		/** Where to buy tickets, or "". */
		ticketUrl: t.text("ticket_url").notNull().default(""),
		/** Tickets sold, or null when not known. */
		ticketsSold: t.integer("tickets_sold"),
		/** Head count, or null when not known. */
		attendance: t.integer("attendance"),
		/** The deal as free text ("80/20 after the first $300"). */
		deal: t.text("deal").notNull().default(""),
		promoter: t.text("promoter").notNull().default(""),
		promoterContact: t.text("promoter_contact").notNull().default(""),
		/** What the band took home from the show, in cents (may be negative); null when not known. Its payouts are `event_payout` rows. */
		takeCents: t.integer("take_cents"),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("event_account_idx").on(table.accountId),
		t.index("event_day_idx").on(table.accountId, table.startsOn),
		t.index("event_created_by_idx").on(table.createdBy),
		t.index("event_venue_idx").on(table.venueId),
		t.index("event_location_idx").on(table.locationId),
	],
);
