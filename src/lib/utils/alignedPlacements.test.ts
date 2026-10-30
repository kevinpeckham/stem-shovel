import { describe, expect, test } from "vite-plus/test";
import type { Alignment } from "#lib/audio/chartAlignment.js";
import { ALIGNMENT_SAME_PIECE_RATIO } from "#lib/constants/chartAlignment.js";
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
	firstSound: 0,
	lastSound: 16,
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
		const placed = alignedPlacements(bars, alignment({ controlCost: 0.06 }));
		expect(placed.ratio).toBeCloseTo(1.2);
		expect(placed.samePiece).toBe(false);
		expect(
			[...placed.sections, ...placed.keyChanges, ...placed.tempoChanges].every((p) => p.hedged),
		).toBe(true);
	});

	test("not this recording: a first section later than a quarter second keeps its time, one within it starts at 0", () => {
		const late = alignedPlacements(
			bars,
			alignment({ barStarts: [0.6, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2], controlCost: 0.06 }),
		);
		expect(late.samePiece).toBe(false);
		expect(late.sections[0]?.start).toBe(0.6);
		expect(late.sections.at(-1)?.start).toBe(12);
		const near = alignedPlacements(
			bars,
			alignment({ barStarts: [0.2, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2], controlCost: 0.06 }),
		);
		expect(near.sections[0]?.start).toBe(0);
	});

	test("nothing is before 0; a perfect fit has a finite ratio", () => {
		const placed = alignedPlacements(bars, alignment({ cost: 0 }));
		expect(Number.isFinite(placed.ratio)).toBe(true);
		const early = alignedPlacements(
			[bar({}), bar({ key: "G major" })],
			alignment({ barStarts: [-2, -1, 1] }),
		);
		expect(early.keyChanges[0]?.at).toBe(0);
	});

	test("Study 14's real-domain ratios: a correct chart's 2.04 is this recording, a wrong one's 1.24 is not", () => {
		expect(ALIGNMENT_SAME_PIECE_RATIO).toBe(1.6);
		expect(alignedPlacements(bars, alignment({ cost: 0.1, controlCost: 0.204 })).samePiece).toBe(
			true,
		);
		expect(alignedPlacements(bars, alignment({ cost: 0.1, controlCost: 0.124 })).samePiece).toBe(
			false,
		);
	});

	test("FIRST-ONSET: a first section at the chart's first bar starts at the first sound, hedged, only when the chart is this recording", () => {
		const late = { barStarts: [7.15, 9, 11, 13, 15, 17, 19, 21, 23], lastSound: 25 };
		const placed = alignedPlacements(bars, alignment({ ...late, firstSound: 0.02 }));
		expect(placed.sections[0]).toEqual({ name: "Intro", start: 0.02, hedged: true });
		const notThis = alignedPlacements(
			bars,
			alignment({ ...late, firstSound: 0.02, controlCost: 0.06 }),
		);
		expect(notThis.sections[0]?.start).toBe(7.15);
		// A chart whose first section starts after its first bar keeps the path's time.
		const unmarked = [bar({}), ...bars.slice(1)];
		const kept = alignedPlacements(unmarked, alignment({ ...late, firstSound: 0.02 }));
		expect(kept.sections[0]).toEqual({ name: "Verse", start: 11, hedged: true });
	});

	test("LAST-SOUND: the last section starts its chart length before the last sound, hedged, never within a bar of the section before", () => {
		// The Outro is two bars at 120 in 4/4: four seconds.
		const placed = alignedPlacements(bars, alignment({ lastSound: 20.03 }));
		expect(placed.sections.at(-1)?.name).toBe("Outro");
		expect(placed.sections.at(-1)?.start).toBeCloseTo(16.03);
		expect(placed.sections.at(-1)?.hedged).toBe(true);
		// A last sound too early for the outro: one bar (2.4 s at 100) after the Chorus at 8.4.
		const floored = alignedPlacements(bars, alignment({ lastSound: 9 }));
		expect(floored.sections.at(-1)?.start).toBeCloseTo(10.8);
		const notThis = alignedPlacements(bars, alignment({ lastSound: 20.03, controlCost: 0.06 }));
		expect(notThis.sections.at(-1)?.start).toBe(12);
	});

	test("a chart of one section is untouched by LAST-SOUND", () => {
		const one = [bar({ section: "Song" }), bar({}), bar({})];
		const placed = alignedPlacements(
			one,
			alignment({ barStarts: [0, 2.4, 4.8, 7.2], firstSound: 0.3, lastSound: 30 }),
		);
		expect(placed.sections).toEqual([{ name: "Song", start: 0.3, hedged: true }]);
	});
});
