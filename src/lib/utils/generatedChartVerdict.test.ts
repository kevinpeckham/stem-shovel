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

	test("a run that detected the tempo and time signature itself holds an otherwise clean draft (Study 34)", () => {
		expect(
			generatedChartVerdict({
				draft: CLEAN,
				segments: CHORDS,
				undecided: false,
				detectedGrid: true,
			}),
		).toEqual({
			save: false,
			holds: ["its tempo and time signature were detected from the stems and need checking"],
			notes: [],
		});
	});

	test("bars that settled far off the declared tempo hold it; within the drift they do not (Study 34b's comb failures)", () => {
		const drifted = generatedChartVerdict({
			draft: CLEAN,
			segments: CHORDS,
			undecided: false,
			gridDrift: 0.072,
		});
		expect(drifted.save).toBe(false);
		expect(drifted.holds).toEqual(["its bars settled 7% off the declared tempo"]);
		expect(
			generatedChartVerdict({ draft: CLEAN, segments: CHORDS, undecided: false, gridDrift: 0.008 })
				.save,
		).toBe(true);
	});

	test("too few transcribed notes a bar hold it; an unknown count does not (Study 34b's starved transcriptions)", () => {
		// Four bars: nine notes is 2.2 a bar, the bench's worst good-looking wrong draft.
		const thin = generatedChartVerdict({
			draft: CLEAN,
			segments: CHORDS,
			undecided: false,
			noteCount: 9,
		});
		expect(thin.save).toBe(false);
		expect(thin.holds).toEqual(["the stems gave too few notes to hear the chords (2.3 a bar)"]);
		expect(
			generatedChartVerdict({ draft: CLEAN, segments: CHORDS, undecided: false, noteCount: 40 })
				.save,
		).toBe(true);
		expect(
			generatedChartVerdict({ draft: CLEAN, segments: CHORDS, undecided: false, noteCount: null })
				.save,
		).toBe(true);
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
