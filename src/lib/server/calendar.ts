import { db, schema } from "#lib/server/db/index.js";
import { notifyEventReminder } from "#lib/server/notifications.js";
import { reportError } from "#lib/server/reportError.js";
import { eventPlace } from "#lib/utils/eventPlace.js";
import type { CalendarEvent } from "#lib/utils/icsCalendar.js";
import { and, asc, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { nanoid } from "nanoid";

/**
 * The calendar side of shows and practices (docs/band-plan.md, "Pages",
 * "Notifications", "Dashboard"): the dashboard's Upcoming block, the
 * day-before reminders the daily cron sends, and each account's ICS feed
 * behind a token. Every query names its accounts; the feed's token stands
 * in for a sign-in, like a share link.
 */
const { account, event, eventFile } = schema;

/** One row of the dashboard's Upcoming block. */
export interface UpcomingEvent {
	id: string;
	accountSlug: string;
	accountName: string;
	kind: "show" | "practice";
	title: string;
	startsOn: string;
	startsAt: string;
	place: string;
	posterThumbnailUrl: string | null;
}

/** A poster's picture: its thumbnail, else the file itself when it is an image (a PDF has none to show). */
const posterPicture = (f?: { url: string; thumbnailUrl: string | null; contentType: string }) =>
	f ? (f.thumbnailUrl ?? (f.contentType.startsWith("image/") ? f.url : null)) : null;

/**
 * The next shows and practices of these accounts, from `today` (`YYYY-MM-DD`)
 * on, soonest first and by start time within a day, at most `limit`; a
 * canceled one is left out.
 */
export async function upcomingEvents(
	accountIds: string[],
	today: string,
	limit = 6,
): Promise<UpcomingEvent[]> {
	if (accountIds.length === 0) return [];
	const rows = await db.query.event.findMany({
		where: and(
			inArray(event.accountId, accountIds),
			gte(event.startsOn, today),
			ne(event.status, "canceled"),
		),
		orderBy: [asc(event.startsOn), asc(event.startsAt), asc(event.createdAt)],
		limit,
		columns: { id: true, kind: true, title: true, startsOn: true, startsAt: true, venue: true },
		with: {
			account: { columns: { slug: true, name: true } },
			place: { columns: { name: true } },
			location: { columns: { name: true } },
			// The ready poster, newest first: its picture is the row's.
			files: {
				where: and(eq(eventFile.kind, "poster"), eq(eventFile.status, "ready")),
				orderBy: [desc(eventFile.createdAt)],
				limit: 1,
				columns: { url: true, thumbnailUrl: true, contentType: true },
			},
		},
	});
	return rows.map((r) => ({
		id: r.id,
		accountSlug: r.account.slug,
		accountName: r.account.name,
		kind: r.kind,
		title: r.title,
		startsOn: r.startsOn,
		startsAt: r.startsAt,
		place: eventPlace(r),
		posterThumbnailUrl: posterPicture(r.files[0]),
	}));
}

/** Every account's shows and practices on `day` (`YYYY-MM-DD`) that are not canceled: whose reminders go out the day before. */
export async function eventsStartingOn(day: string): Promise<string[]> {
	const rows = await db.query.event.findMany({
		where: and(eq(event.startsOn, day), ne(event.status, "canceled")),
		columns: { id: true },
	});
	return rows.map((r) => r.id);
}

/**
 * The day-before reminders (docs/band-plan.md, "Notifications"): each
 * event on `tomorrow` tells its account's members. One event's failure is
 * logged and reported and the rest go on; this never throws, so the cron's
 * digests are reported whatever happens here. The count is the events
 * reminded about.
 */
export async function sendEventReminders(tomorrow: string): Promise<number> {
	let ids: string[];
	try {
		ids = await eventsStartingOn(tomorrow);
	} catch (e) {
		console.error("[reminders]", e);
		reportError(e, { job: "event-reminders" }, { day: tomorrow });
		return 0;
	}
	let sent = 0;
	for (const id of ids) {
		try {
			await notifyEventReminder(id);
			sent++;
		} catch (e) {
			console.error("[reminders]", id, e);
			reportError(e, { job: "event-reminders" }, { eventId: id });
		}
	}
	return sent;
}

/** The account's calendar token, made the first time it is asked for (24 characters of nanoid). */
export async function calendarTokenOf(accountId: string): Promise<string> {
	const read = () =>
		db.query.account.findFirst({
			where: eq(account.id, accountId),
			columns: { calendarToken: true },
		});
	const row = await read();
	if (row?.calendarToken) return row.calendarToken;
	// Only while it has none: two first asks at once agree on the one that landed.
	await db
		.update(account)
		.set({ calendarToken: nanoid(24) })
		.where(and(eq(account.id, accountId), isNull(account.calendarToken)));
	const made = await read();
	if (!made?.calendarToken) throw new Error(`No calendar token for account ${accountId}`);
	return made.calendarToken;
}

/** The account a calendar token belongs to, or null for a token nobody made. */
export async function accountByCalendarToken(
	token: string,
): Promise<{ id: string; slug: string; name: string } | null> {
	if (!token) return null;
	const row = await db.query.account.findFirst({
		where: eq(account.calendarToken, token),
		columns: { id: true, slug: true, name: true },
	});
	return row ?? null;
}

/** Every show and practice of the account, past and future, soonest first, as the ICS feed lists them. */
export async function calendarEvents(accountId: string): Promise<CalendarEvent[]> {
	const rows = await db.query.event.findMany({
		where: eq(event.accountId, accountId),
		orderBy: [asc(event.startsOn), asc(event.startsAt)],
		columns: {
			id: true,
			kind: true,
			status: true,
			title: true,
			startsOn: true,
			startsAt: true,
			endsAt: true,
			venue: true,
			address: true,
			city: true,
			updatedAt: true,
		},
		with: {
			account: { columns: { slug: true } },
			place: { columns: { name: true, address: true, city: true } },
			location: { columns: { name: true, address: true } },
		},
	});
	return rows.map((r) => ({
		id: r.id,
		accountSlug: r.account.slug,
		kind: r.kind,
		status: r.status,
		title: r.title,
		startsOn: r.startsOn,
		startsAt: r.startsAt,
		endsAt: r.endsAt,
		place: r.place ?? (r.location ? { ...r.location, city: "" } : null),
		venueText: r.venue,
		addressText: r.address,
		cityText: r.city,
		updatedAt: r.updatedAt,
	}));
}
