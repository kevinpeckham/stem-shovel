import { describe, expect, test } from "vite-plus/test";
import type { ChartlessRefusal } from "#lib/audio/chartlessGridInBrowser.js";
import type { GridReading, PlacedGrid, Witness } from "@barmark/listen";
import { chartlessPlacementLine } from "./chartlessPlacementLine.js";

const witness = (name: Witness["name"], cls: number | null): Witness => ({
	name,
	cls,
	weight: name === "sections" ? 1 : 2,
	detail: {},
});

/** The grid's reading: the comb's bar of 2 s in 4/4, voted class 1 by `witnesses`. */
const readingOf = (witnesses: Witness[], over: Partial<GridReading> = {}): GridReading => ({
	comb: { period: 2, phase: 0.43, score: 1 },
	lattice: { anchor: 0.5, beat: 0.5, period: 2, beatsPerBar: 4 },
	witnesses,
	scores: [0, 4, 0, 0],
	cls: 1,
	decided: true,
	byStart: false,
	...over,
});

/** 76 bars of 2 s from 0.5 s (@barmark/listen's placed grid), voted class 1 by `witnesses`. */
const placed = (witnesses: Witness[], over: Partial<GridReading> = {}): PlacedGrid => ({
	grid: { bars: Array.from({ length: 77 }, (_, i) => 0.5 + 2 * i) },
	pickup: null,
	reading: readingOf(witnesses, over),
});

/** A refusal of the grid: its reason, and the reading when it got that far. */
const refused = (
	reason: ChartlessRefusal["reason"],
	witnesses: Witness[] | null = null,
): ChartlessRefusal => ({
	ok: false,
	reason,
	message: `The package says ${reason}.`,
	reading: witnesses ? readingOf(witnesses, { decided: false }) : null,
});

/** The placement line on the detected chords card (utils/chartlessPlacementLine.ts). */
describe("chartlessPlacementLine", () => {
	test("names the witnesses that agreed on bar one", () => {
		expect(
			chartlessPlacementLine(
				placed([witness("timeZero", 1), witness("harmonicRhythm", 1), witness("sections", 3)]),
			),
		).toBe(
			"Bars placed on the stems' own beat: bar 1 at 0:00.5, 76 bars; the chord changes and the recording's start agree.",
		);
		expect(
			chartlessPlacementLine(
				placed([witness("timeZero", null), witness("harmonicRhythm", 1), witness("sections", 1)]),
			),
		).toMatch(/; the chord changes and the section changes agree\.$/);
		expect(
			chartlessPlacementLine(
				placed([witness("timeZero", 1), witness("harmonicRhythm", 1), witness("sections", 1)]),
			),
		).toMatch(/; the chord changes, the recording's start and the section changes agree\.$/);
	});

	test("a lone witness says so", () => {
		expect(
			chartlessPlacementLine(
				placed([
					witness("timeZero", null),
					witness("harmonicRhythm", 1),
					witness("sections", null),
				]),
			),
		).toMatch(/; the chord changes alone\.$/);
	});

	test("at the song's own start, and nothing placed", () => {
		expect(chartlessPlacementLine(placed([], { byStart: true }))).toBe(
			"Bars placed on the stems' own beat from your start of bar 1: 76 bars.",
		);
		expect(chartlessPlacementLine(null)).toBe("");
	});

	test("an undecided vote says what each witness read, 1-based, and that the song's own grid stands", () => {
		const refusal = refused("downbeat-undecided", [
			witness("timeZero", 0),
			witness("harmonicRhythm", 2),
			witness("sections", null),
		]);
		expect(chartlessPlacementLine(null, refusal)).toBe(
			"Bar 1 not placed from the stems: the chord changes say beat 3, the recording's start says beat 1, the section changes abstain. The bars follow your tempo and start of bar 1.",
		);
		expect(
			chartlessPlacementLine(
				null,
				refused("downbeat-undecided", [witness("timeZero", null), witness("sections", 1)]),
			),
		).toBe(
			"Bar 1 not placed from the stems: the recording's start abstains, the section changes say beat 2. The bars follow your tempo and start of bar 1.",
		);
	});

	test("no usable beat (a flat envelope, or nothing to read), no fit, and an unavailable reading", () => {
		for (const reason of ["no-period", "invalid-input"] as const)
			expect(chartlessPlacementLine(null, refused(reason))).toBe(
				"Bar 1 not placed from the stems: they gave no usable beat.",
			);
		expect(chartlessPlacementLine(null, refused("nothing-fits"))).toBe(
			"Bar 1 not placed from the stems: no bar on their beat fits the recording.",
		);
		expect(chartlessPlacementLine(null, refused("unavailable"))).toBe("");
	});

	test("a reason the app has no sentence for is said in the package's words", () => {
		expect(chartlessPlacementLine(null, refused("features-invalid"))).toBe(
			"Bar 1 not placed from the stems: The package says features-invalid.",
		);
	});
});
