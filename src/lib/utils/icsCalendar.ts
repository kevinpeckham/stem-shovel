import type { EventKind, EventStatus } from "#lib/val/EventSchema.js";

/** One show or practice as the feed needs it (src/lib/server/calendar.ts, `calendarEvents`). */
export interface CalendarEvent {
	id: string;
	accountSlug: string;
	kind: EventKind;
	status: EventStatus;
	title: string;
	/** `YYYY-MM-DD`. */
	startsOn: string;
	/** Local wall-clock `HH:MM`, or "". */
	startsAt: string;
	endsAt: string;
	/** Its venue, else its practice location (no city), else null. */
	place: { name: string; address: string; city: string } | null;
	/** The free text from before venues were rows. */
	venueText: string;
	addressText: string;
	cityText: string;
	updatedAt: Date;
}

const KIND_NAME: Record<EventKind, string> = { show: "Show", practice: "Practice" };

/** RFC 5545 text: backslash, semicolon, comma and newlines escaped. */
const escapeText = (s: string) =>
	s
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r\n|\r|\n/g, "\\n");

const encoder = new TextEncoder();

/** A content line folded at 75 octets (continuations start with a space, which counts), never inside a character. */
function fold(line: string): string {
	const out: string[] = [];
	let current = "";
	let octets = 0;
	for (const ch of line) {
		const size = encoder.encode(ch).length;
		const limit = out.length === 0 ? 75 : 74;
		if (octets + size > limit) {
			out.push(current);
			current = "";
			octets = 0;
		}
		current += ch;
		octets += size;
	}
	out.push(current);
	return out.join("\r\n ");
}

/** `2026-10-28` → `20261028`. */
const date = (day: string) => day.replaceAll("-", "");
/** A floating local time (no zone: a time on a poster is the venue's): `20261028T200000`. */
const localTime = (day: string, hhmm: string) => `${date(day)}T${hhmm.replace(":", "")}00`;
/** The next calendar day of a `YYYY-MM-DD`. */
function nextDay(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
/** A moment in UTC: `20261028T130000Z`. */
const utc = (at: Date) => `${at.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;

/** Where it is, for LOCATION: the venue's name, address and city, else the legacy text. */
function locationOf(e: CalendarEvent): string {
	const parts = e.place
		? [e.place.name, e.place.address, e.place.city]
		: [e.venueText, e.addressText, e.cityText];
	return parts
		.map((p) => p.trim())
		.filter(Boolean)
		.join(", ");
}

function vevent(e: CalendarEvent, base: string): string[] {
	const location = locationOf(e);
	const summary = e.title.trim() || e.place?.name.trim() || e.venueText.trim() || KIND_NAME[e.kind];
	const lines = ["BEGIN:VEVENT", `UID:${e.id}@stemshovel.com`, `DTSTAMP:${utc(e.updatedAt)}`];
	if (e.startsAt) {
		lines.push(`DTSTART:${localTime(e.startsOn, e.startsAt)}`);
		// An end before the start is past midnight: the next day.
		if (e.endsAt)
			lines.push(
				`DTEND:${localTime(e.endsAt < e.startsAt ? nextDay(e.startsOn) : e.startsOn, e.endsAt)}`,
			);
	} else {
		lines.push(`DTSTART;VALUE=DATE:${date(e.startsOn)}`);
	}
	lines.push(`SUMMARY:${escapeText(summary)}`);
	if (location) lines.push(`LOCATION:${escapeText(location)}`);
	lines.push(`URL:${base}/${e.accountSlug}/events/${e.id}`);
	if (e.status === "canceled") lines.push("STATUS:CANCELLED");
	lines.push("END:VEVENT");
	return lines;
}

/**
 * An account's shows and practices as an iCalendar feed (RFC 5545), for a
 * phone or a shared calendar to subscribe to (docs/band-plan.md): one
 * VEVENT per event, timed ones at floating local times, the rest all day;
 * CRLF line endings, text escaped, lines folded at 75 octets. `base` is
 * the site's origin, for each event's URL.
 */
export function icsCalendar(name: string, events: CalendarEvent[], base: string): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Stem Shovel//Events//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${escapeText(name)}`,
		...events.flatMap((e) => vevent(e, base)),
		"END:VCALENDAR",
	];
	return `${lines.map(fold).join("\r\n")}\r\n`;
}
