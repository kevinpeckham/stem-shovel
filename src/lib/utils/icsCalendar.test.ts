import { describe, expect, it } from "vite-plus/test";
import { icsCalendar, type CalendarEvent } from "./icsCalendar";

const BASE = "https://www.stemshovel.com";

const ev = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
	id: "ev1",
	accountSlug: "lj",
	kind: "show",
	status: "confirmed",
	title: "Release show",
	startsOn: "2026-11-14",
	startsAt: "20:00",
	endsAt: "23:30",
	place: { name: "The Echo", address: "1822 Sunset Blvd", city: "Los Angeles" },
	venueText: "",
	addressText: "",
	cityText: "",
	updatedAt: new Date(Date.UTC(2026, 9, 28, 13, 5, 9)),
	...over,
});

const lines = (ics: string) => ics.split("\r\n");

describe("icsCalendar", () => {
	it("a calendar with one timed show, CRLF throughout", () => {
		const ics = icsCalendar("Lightning Jar", [ev()], BASE);
		expect(ics.endsWith("\r\n")).toBe(true);
		expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
		expect(lines(ics)).toEqual([
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//Stem Shovel//Events//EN",
			"CALSCALE:GREGORIAN",
			"METHOD:PUBLISH",
			"X-WR-CALNAME:Lightning Jar",
			"BEGIN:VEVENT",
			"UID:ev1@stemshovel.com",
			"DTSTAMP:20261028T130509Z",
			"DTSTART:20261114T200000",
			"DTEND:20261114T233000",
			"SUMMARY:Release show",
			"LOCATION:The Echo\\, 1822 Sunset Blvd\\, Los Angeles",
			"URL:https://www.stemshovel.com/lj/events/ev1",
			"END:VEVENT",
			"END:VCALENDAR",
			"",
		]);
	});
	it("no time is an all-day event with no end", () => {
		const out = lines(icsCalendar("LJ", [ev({ startsAt: "", endsAt: "22:00" })], BASE));
		expect(out).toContain("DTSTART;VALUE=DATE:20261114");
		expect(out.some((l) => l.startsWith("DTEND"))).toBe(false);
	});
	it("a start with no end has no DTEND; an end before the start is the next day", () => {
		expect(
			lines(icsCalendar("LJ", [ev({ endsAt: "" })], BASE)).some((l) => l.startsWith("DTEND")),
		).toBe(false);
		expect(lines(icsCalendar("LJ", [ev({ startsAt: "22:00", endsAt: "01:30" })], BASE))).toContain(
			"DTEND:20261115T013000",
		);
	});
	it("an untitled event is called by its place, else its kind; the legacy text stands in for a venue", () => {
		const out = lines(
			icsCalendar(
				"LJ",
				[
					ev({ id: "a", title: "" }),
					ev({
						id: "b",
						title: "",
						place: null,
						venueText: "Old Hall",
						addressText: "",
						cityText: "Reno",
					}),
					ev({ id: "c", kind: "practice", title: "", place: null }),
				],
				BASE,
			),
		);
		expect(out.filter((l) => l.startsWith("SUMMARY"))).toEqual([
			"SUMMARY:The Echo",
			"SUMMARY:Old Hall",
			"SUMMARY:Practice",
		]);
		expect(out.filter((l) => l.startsWith("LOCATION"))).toEqual([
			"LOCATION:The Echo\\, 1822 Sunset Blvd\\, Los Angeles",
			"LOCATION:Old Hall\\, Reno",
		]);
	});
	it("escapes backslashes, semicolons, commas and newlines", () => {
		const out = lines(icsCalendar("A;B", [ev({ title: "Us, them; a\\b\nnext" })], BASE));
		expect(out).toContain("X-WR-CALNAME:A\\;B");
		expect(out).toContain("SUMMARY:Us\\, them\\; a\\\\b\\nnext");
	});
	it("a canceled show says so", () => {
		expect(lines(icsCalendar("LJ", [ev({ status: "canceled" })], BASE))).toContain(
			"STATUS:CANCELLED",
		);
	});
	it("folds lines at 75 octets without splitting a character", () => {
		const title = "Ü".repeat(60) + "x".repeat(40);
		const ics = icsCalendar("LJ", [ev({ title })], BASE);
		const encoder = new TextEncoder();
		for (const l of lines(ics)) expect(encoder.encode(l).length).toBeLessThanOrEqual(75);
		const summary = ics.split("\r\n").filter((l, i, all) => {
			const start = all.findIndex((x) => x.startsWith("SUMMARY:"));
			return i >= start && (i === start || l.startsWith(" ")) && i < start + 4;
		});
		expect(summary.length).toBeGreaterThan(1);
		expect(summary.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(`SUMMARY:${title}`);
	});
});
