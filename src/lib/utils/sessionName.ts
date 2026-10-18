import { SESSION_KIND_LABELS, type SessionKind } from "#lib/constants/sessionRecordings.js";
import { formatDate } from "./formatDate";

/** A `YYYY-MM-DD` day as "Oct 18, 2026", read as a local date (never shifted by a time zone). */
export function dayText(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	return y && m && d ? formatDate(new Date(y, m - 1, d)) : day;
}

/**
 * What a session is called: its own name when it has one, else the place
 * and the day ("The Elbow Room · Oct 18, 2026"), or the kind and the day
 * with no place ("Practice · Oct 18, 2026") (Kevin: the name defaults to
 * location and date).
 */
export function sessionDisplayName(s: {
	name: string;
	place: string;
	kind: SessionKind;
	startsOn: string;
}): string {
	if (s.name.trim()) return s.name.trim();
	return `${s.place.trim() || SESSION_KIND_LABELS[s.kind]} · ${dayText(s.startsOn)}`;
}
