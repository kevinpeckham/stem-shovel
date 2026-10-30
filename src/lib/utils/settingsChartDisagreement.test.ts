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

	test("tempos within 2 % (at least 3 bpm) agree", () => {
		expect(
			settingsChartDisagreement({ tempo: "97", meter: null }, { tempo: 96, meter: null }),
		).toBeNull();
		expect(
			settingsChartDisagreement({ tempo: "99", meter: null }, { tempo: 96, meter: null }),
		).toBeNull();
		expect(
			settingsChartDisagreement({ tempo: "100", meter: null }, { tempo: 96, meter: null }),
		).toMatch(/100 bpm but the chart marks 96/);
		expect(
			settingsChartDisagreement({ tempo: "120", meter: "4/4" }, { tempo: 96, meter: "4/4" }),
		).toMatch(/120 bpm but the chart marks 96/);
	});

	test("tempos on the same ladder agree: double and half always, 3:2 only with a compound meter", () => {
		expect(
			settingsChartDisagreement({ tempo: "224", meter: null }, { tempo: 112, meter: null }),
		).toBeNull();
		expect(
			settingsChartDisagreement({ tempo: "120", meter: null }, { tempo: 80, meter: "6/8" }),
		).toBeNull();
		expect(
			settingsChartDisagreement({ tempo: "120", meter: "4/4" }, { tempo: 80, meter: "4/4" }),
		).toBe(
			"The song's settings say 120 bpm but the chart marks 80: the key changes are placed approximately.",
		);
	});

	test("a waltz counted in beats against one counted in bars agrees only with a meter of three", () => {
		expect(
			settingsChartDisagreement({ tempo: "224", meter: "3/4" }, { tempo: 74.7, meter: null }),
		).toBeNull();
		expect(
			settingsChartDisagreement({ tempo: "224", meter: "4/4" }, { tempo: 74.7, meter: null }),
		).toMatch(/224 bpm but the chart marks 74.7/);
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
