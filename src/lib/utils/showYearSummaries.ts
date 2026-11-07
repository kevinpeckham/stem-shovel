import type { EventStatus } from "#lib/val/EventSchema.js";

/** What the totals read of a show (a `Pick` of `EventListRow`). */
type ShowBooks = {
	startsOn: string;
	status: EventStatus;
	ticketsSold: number | null;
	takeCents: number | null;
};

/** One year of shows on the Shows page: how many were played, the tickets sold and the take across them. */
export type ShowYearSummary = {
	year: string;
	played: number;
	ticketsSold: number;
	takeCents: number;
	/** False when no played show of the year had tickets sold recorded. */
	hasTickets: boolean;
	/** False when no played show of the year had a take recorded. */
	hasTake: boolean;
};

/**
 * The Shows page's totals by year (docs/band-plan.md phase 4, "The
 * books"), newest year first: a show counts once it was played, and the
 * tickets and the take sum over played shows only (a planned show's
 * projected take is not income).
 */
export function showYearSummaries(rows: ShowBooks[]): ShowYearSummary[] {
	const years = new Map<string, ShowYearSummary>();
	for (const r of rows) {
		const year = r.startsOn.slice(0, 4);
		const y = years.get(year) ?? {
			year,
			played: 0,
			ticketsSold: 0,
			takeCents: 0,
			hasTickets: false,
			hasTake: false,
		};
		years.set(year, y);
		if (r.status !== "played") continue;
		y.played += 1;
		if (r.ticketsSold !== null) {
			y.ticketsSold += r.ticketsSold;
			y.hasTickets = true;
		}
		if (r.takeCents !== null) {
			y.takeCents += r.takeCents;
			y.hasTake = true;
		}
	}
	return [...years.values()].sort((a, b) => b.year.localeCompare(a.year));
}
