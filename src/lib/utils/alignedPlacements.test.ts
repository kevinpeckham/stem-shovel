import { describe, expect, test } from "vite-plus/test";
import type { Alignment } from "#lib/audio/chartAlignment.js";
import { alignedPlacements } from "./alignedPlacements.js";
import type { ChartBar } from "./chartBars.js";

const bar = (over: Partial<ChartBar>): ChartBar => ({
	measure: 1,
	chords: ["D"],
	bpm: 100,
	meter: "4/4",
	key: "D major",
	section: null,
	...over,
});

const bars: ChartBar[] = [
	bar({ section: "Intro" }),
	bar({}),
	bar({ section: "Verse" }),
	bar({}),
	bar({ section: "Chorus", key: "E major" }),
	bar({ key: "E major", bpm: 120 }),
	bar({ section: "Outro", key: "E major", bpm: 120 }),
	bar({ key: "E major", bpm: 120 }),
];

const alignment = (over: Partial<Alignment> = {}): Alignment => ({
	barStarts: [0.1, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2],
	cost: 0.05,
	controlCost: 0.5,
	localCost: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
	hopSec: 0.093,
	...over,
});

describe("alignedPlacements", () => {
	test("sections, key and tempo changes at their bars; the first and last sections hedged; a first section near 0 at 0", () => {
		const placed = alignedPlacements(bars, alignment());
		expect(placed.sections).toEqual([
			{ name: "Intro", start: 0, hedged: true },
			{ name: "Verse", start: 4.4, hedged: false },
			{ name: "Chorus", start: 8.4, hedged: false },
			{ name: "Outro", start: 12, hedged: true },
		]);
		expect(placed.keyChanges).toEqual([{ at: 8.4, key: "E major", hedged: false }]);
		expect(placed.tempoChanges).toEqual([{ at: 10.4, bpm: 120, hedged: false }]);
		expect(placed.ratio).toBeCloseTo(10);
		expect(placed.samePiece).toBe(true);
	});

	test("a bar whose local cost is over twice the median hedges what is placed there", () => {
		const localCost = [0.05, 0.05, 0.05, 0.05, 0.2, 0.05, 0.05, 0.05];
		const placed = alignedPlacements(bars, alignment({ localCost }));
		expect(placed.sections.find((s) => s.name === "Chorus")?.hedged).toBe(true);
		expect(placed.keyChanges[0]?.hedged).toBe(true);
		expect(placed.tempoChanges[0]?.hedged).toBe(false);
	});

	test("a chart that is not this recording hedges everything", () => {
		const placed = alignedPlacements(bars, alignment({ controlCost: 0.1 }));
		expect(placed.ratio).toBeCloseTo(2);
		expect(placed.samePiece).toBe(false);
		expect(
			[...placed.sections, ...placed.keyChanges, ...placed.tempoChanges].every((p) => p.hedged),
		).toBe(true);
	});

	test("a first section later than a quarter second keeps its time; nothing is before 0; a perfect fit has a finite ratio", () => {
		const placed = alignedPlacements(
			bars,
			alignment({ barStarts: [0.6, -1, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2], cost: 0 }),
		);
		expect(placed.sections[0]?.start).toBe(0.6);
		expect(Number.isFinite(placed.ratio)).toBe(true);
		const early = alignedPlacements(
			[bar({}), bar({ key: "G major" })],
			alignment({ barStarts: [-2, -1, 1] }),
		);
		expect(early.keyChanges[0]?.at).toBe(0);
	});
});
