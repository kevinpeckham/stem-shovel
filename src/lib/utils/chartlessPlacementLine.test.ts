import { describe, expect, test } from "vite-plus/test";
import type { ChartlessGrid, ChartlessRefusal, DownbeatWitness } from "#lib/audio/chartlessGrid.js";
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

	test("an undecided vote says what each witness read, 1-based, and that the song's own grid stands", () => {
		const refusal: ChartlessRefusal = {
			ok: false,
			reason: "undecided",
			witnesses: [witness("timeZero", 0), witness("harmonicRhythm", 2), witness("sections", null)],
		};
		expect(chartlessPlacementLine(null, refusal)).toBe(
			"Bar 1 not placed from the stems: the chord changes say beat 3, the recording's start says beat 1, the section changes abstain. The bars follow your tempo and start of bar 1.",
		);
		expect(
			chartlessPlacementLine(null, {
				...refusal,
				witnesses: [witness("timeZero", null), witness("sections", 1)],
			}),
		).toBe(
			"Bar 1 not placed from the stems: the recording's start abstains, the section changes say beat 2. The bars follow your tempo and start of bar 1.",
		);
	});

	test("no usable beat, no fit, and an unavailable reading", () => {
		const refusal = (reason: ChartlessRefusal["reason"]): ChartlessRefusal => ({
			ok: false,
			reason,
			witnesses: [],
		});
		expect(chartlessPlacementLine(null, refusal("no-input"))).toBe(
			"Bar 1 not placed from the stems: they gave no usable beat.",
		);
		expect(chartlessPlacementLine(null, refusal("no-fit"))).toBe(
			"Bar 1 not placed from the stems: no bar on their beat fits the recording.",
		);
		expect(chartlessPlacementLine(null, refusal("unavailable"))).toBe("");
	});
});
