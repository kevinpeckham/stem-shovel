import { describe, expect, it } from "vite-plus/test";
import { dayFitsSession, localDay, shiftDay } from "./isoDay";

describe("isoDay", () => {
	it("gives the local day of a Date, zero-padded", () => {
		expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
		expect(localDay(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
	});
	it("shifts by whole days across month and year ends", () => {
		expect(shiftDay("2026-10-18", -1)).toBe("2026-10-17");
		expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
		expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
		expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
	});
	it("lets a recording join a session of its day or the day before, never further", () => {
		expect(dayFitsSession("2026-10-18", "2026-10-18")).toBe(true);
		expect(dayFitsSession("2026-10-18", "2026-10-17")).toBe(true);
		expect(dayFitsSession("2026-10-18", "2026-10-19")).toBe(false);
		expect(dayFitsSession("2026-10-18", "2026-10-16")).toBe(false);
	});
});
