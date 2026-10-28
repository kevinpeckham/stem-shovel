import { describe, expect, test } from "vite-plus/test";
import { settingsChartDisagreement } from "./settingsChartDisagreement.js";

describe("settingsChartDisagreement", () => {
	test("agreement, or a side that states nothing, raises nothing", () => {
		expect(
			settingsChartDisagreement({ tempo: "96", meter: "3/4" }, { tempo: 96, meter: "3/4" }),
		).toBeNull();
		expect(
			settingsChartDisagreement({ tempo: "120", meter: "4/4" }, { tempo: null, meter: null }),
		).toBeNull();
		expect(
			settingsChartDisagreement({ tempo: null, meter: null }, { tempo: 96, meter: "3/4" }),
		).toBeNull();
	});

	test("tempos within 2 % agree", () => {
		expect(
			settingsChartDisagreement({ tempo: "97", meter: null }, { tempo: 96, meter: null }),
		).toBeNull();
		expect(
			settingsChartDisagreement({ tempo: "99", meter: null }, { tempo: 96, meter: null }),
		).toMatch(/99 bpm but the chart marks 96/);
	});

	test("a differing tempo and meter are both named", () => {
		expect(
			settingsChartDisagreement({ tempo: "120", meter: "4/4" }, { tempo: 96, meter: "3/4" }),
		).toBe(
			"The song's settings say 120 bpm but the chart marks 96, and 4/4 but the chart marks 3/4: the key changes are placed approximately.",
		);
		expect(
			settingsChartDisagreement({ tempo: "96", meter: "4/4" }, { tempo: 96, meter: "6/8" }),
		).toBe(
			"The song's settings say 4/4 but the chart marks 6/8: the key changes are placed approximately.",
		);
	});
});
