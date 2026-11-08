import { describe, expect, test } from "vite-plus/test";
import type { ChartlessGrid, DownbeatWitness } from "#lib/audio/chartlessGrid.js";
import { chartlessPlacementLine } from "./chartlessPlacementLine.js";

const witness = (name: DownbeatWitness["name"], cls: number | null): DownbeatWitness => ({
	name,
	cls,
	weight: name === "sections" ? 1 : 2,
	detail: {},
});

/** 76 bars of 2 s from 0.5 s, voted class 1 by `witnesses`. */
const placed = (
	witnesses: DownbeatWitness[],
	over: Partial<ChartlessGrid> = {},
): ChartlessGrid => ({
	barStarts: Array.from({ length: 77 }, (_, i) => 0.5 + 2 * i),
	period: 2,
	beatsPerBar: 4,
	cls: 1,
	decided: true,
	byStart: false,
	witnesses,
	...over,
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
});
