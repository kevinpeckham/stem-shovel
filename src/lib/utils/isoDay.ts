/**
 * Calendar days as `YYYY-MM-DD` with no time zone to shift them (a
 * session's day, a recording's): the day a Date falls on where the browser
 * is, a day moved by whole days, and the two-day rule a session may span.
 */
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The local calendar day of a Date (the uploader's own midnight, not UTC's). */
export function localDay(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** `day` moved by `n` days (negative for earlier), computed in UTC so no daylight change can skip or repeat a day. */
export function shiftDay(day: string, n: number): string {
	const [y, m, d] = day.split("-").map(Number);
	const t = Date.UTC(y!, m! - 1, d! + n);
	return new Date(t).toISOString().slice(0, 10);
}

/**
 * Whether a recording made on `recordedOn` may belong to a session that
 * starts on `startsOn`: the same day, or the day after (a show that runs
 * past midnight; sessions never span more than two days, Kevin).
 */
export function dayFitsSession(recordedOn: string, startsOn: string): boolean {
	return recordedOn === startsOn || recordedOn === shiftDay(startsOn, 1);
}
