import { describe, expect, test } from "vite-plus/test";
import { generatedChartVerdict } from "./generatedChartVerdict";

const CHORDS = [
	{ chord: "D", bars: 2 },
	{ chord: "A", bars: 1 },
	{ chord: "G", bars: 1 },
];
const CLEAN = { diagnostics: [], timing: { chart: { bars: 4 } } };

describe("generatedChartVerdict", () => {
	test("a clean draft saves with nothing to say", () => {
		expect(generatedChartVerdict({ draft: CLEAN, segments: CHORDS, undecided: false })).toEqual({
			save: true,
			holds: [],
			notes: [],
		});
	});

	test("an error, a dropped timing map and mostly unnamed bars each hold it", () => {
		const held = generatedChartVerdict({
			draft: { diagnostics: [{ level: "error" }], timing: null },
			segments: [
				{ chord: "?", bars: 2 },
				{ chord: "N.C.", bars: 1 },
				{ chord: "G", bars: 1 },
			],
			undecided: false,
		});
		expect(held.save).toBe(false);
		expect(held.holds).toEqual([
			"the chart has errors",
			"its bar count no longer matches the stems, so it has no timing",
			"most of its bars have no chord the model could name",
		]);
	});

	test("half the bars unnamed is not most; a draft without a timing field is not held for it", () => {
		const v = generatedChartVerdict({
			draft: { diagnostics: [] },
			segments: [
				{ chord: "?", bars: 2 },
				{ chord: "D", bars: 2 },
			],
			undecided: false,
		});
		expect(v.save).toBe(true);
		expect(generatedChartVerdict({ draft: CLEAN, segments: [], undecided: false }).save).toBe(true);
	});

	test("an undecided vote and warnings are notes, saved anyway", () => {
		expect(
			generatedChartVerdict({
				draft: { ...CLEAN, diagnostics: [{ level: "warning" }, { level: "warning" }] },
				segments: CHORDS,
				undecided: true,
			}),
		).toEqual({
			save: true,
			holds: [],
			notes: ["bar 1 was not placed from the stems", "2 warnings on the chart"],
		});
		expect(
			generatedChartVerdict({
				draft: { ...CLEAN, diagnostics: [{ level: "warning" }] },
				segments: CHORDS,
				undecided: false,
			}).notes,
		).toEqual(["1 warning on the chart"]);
	});
});
