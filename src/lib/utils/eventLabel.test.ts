import { describe, expect, test } from "vite-plus/test";
import { eventLabel } from "./eventLabel";

const day = { startsOn: "2026-10-18" };

describe("eventLabel", () => {
	test("the title, else the venue, then the day", () => {
		expect(eventLabel({ ...day, title: "Release show", venue: "The Echo", kind: "show" })).toBe(
			"Release show · Oct 18, 2026",
		);
		expect(eventLabel({ ...day, title: "", venue: "The Echo", kind: "show" })).toBe(
			"The Echo · Oct 18, 2026",
		);
	});
	test("neither: the kind", () => {
		expect(eventLabel({ ...day, title: "", venue: "", kind: "show" })).toBe(
			"the show · Oct 18, 2026",
		);
		expect(eventLabel({ ...day, title: "", venue: "", kind: "practice" })).toBe(
			"the practice · Oct 18, 2026",
		);
	});
});
