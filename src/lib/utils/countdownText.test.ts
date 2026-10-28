import { describe, expect, it } from "vite-plus/test";
import { countdownText } from "./countdownText";

const TODAY = "2026-10-28";

describe("countdownText", () => {
	it("today and tomorrow by name", () => {
		expect(countdownText("2026-10-28", TODAY)).toBe("Today");
		expect(countdownText("2026-10-29", TODAY)).toBe("Tomorrow");
	});
	it("days up to six, across a month's end", () => {
		expect(countdownText("2026-10-31", TODAY)).toBe("In 3 days");
		expect(countdownText("2026-11-03", TODAY)).toBe("In 6 days");
	});
	it("whole weeks from 7 to 27 days, rounded down", () => {
		expect(countdownText("2026-11-04", TODAY)).toBe("In a week");
		expect(countdownText("2026-11-10", TODAY)).toBe("In a week");
		expect(countdownText("2026-11-11", TODAY)).toBe("In 2 weeks");
		expect(countdownText("2026-11-24", TODAY)).toBe("In 3 weeks");
	});
	it("months of thirty days from 28 days, rounded down", () => {
		expect(countdownText("2026-11-25", TODAY)).toBe("In a month");
		expect(countdownText("2026-12-27", TODAY)).toBe("In 2 months");
		expect(countdownText("2027-10-28", TODAY)).toBe("In 12 months");
	});
	it("a day already past reads as today", () => {
		expect(countdownText("2026-10-27", TODAY)).toBe("Today");
	});
});
