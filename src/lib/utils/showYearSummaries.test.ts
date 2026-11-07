import { describe, expect, test } from "vite-plus/test";
import { showYearSummaries } from "./showYearSummaries";

const row = (
	startsOn: string,
	status: "planned" | "played" | "canceled",
	ticketsSold: number | null,
	takeCents: number | null,
) => ({ startsOn, status, ticketsSold, takeCents });

describe("showYearSummaries", () => {
	test("sums played shows by year, newest year first", () => {
		expect(
			showYearSummaries([
				row("2025-03-01", "played", 40, 30000),
				row("2026-01-10", "played", 50, 45000),
				row("2026-06-02", "played", null, -2000),
				row("2025-11-20", "played", 10, null),
			]),
		).toEqual([
			{
				year: "2026",
				played: 2,
				ticketsSold: 50,
				takeCents: 43000,
				hasTickets: true,
				hasTake: true,
			},
			{
				year: "2025",
				played: 2,
				ticketsSold: 50,
				takeCents: 30000,
				hasTickets: true,
				hasTake: true,
			},
		]);
	});

	test("a planned or canceled show is not income and not played", () => {
		const [y] = showYearSummaries([
			row("2026-12-01", "planned", 100, 90000),
			row("2026-05-01", "canceled", 5, 500),
			row("2026-04-01", "played", null, null),
		]);
		expect(y).toEqual({
			year: "2026",
			played: 1,
			ticketsSold: 0,
			takeCents: 0,
			hasTickets: false,
			hasTake: false,
		});
	});

	test("a year with nothing played still appears, with zero played", () => {
		expect(showYearSummaries([row("2027-02-01", "planned", null, 1000)])).toEqual([
			{ year: "2027", played: 0, ticketsSold: 0, takeCents: 0, hasTickets: false, hasTake: false },
		]);
	});

	test("no shows, no years", () => {
		expect(showYearSummaries([])).toEqual([]);
	});
});
