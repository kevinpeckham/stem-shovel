import { describe, expect, test } from "vite-plus/test";
import type { Alignment } from "@barmark/listen";
import { alignedPlacements } from "./alignedPlacements.js";
import { barmarkChartBars, type ChartBar } from "./barmarkChartBars.js";

/**
 * What the aligned chart places, from the app's own reading of the chart
 * (`ChartBar`: sections named by heading, rehearsal mark or words; tempo in
 * the song's unit) at @barmark/listen's aligned bar starts, gated and
 * hedged by its alignment.
 */
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
	rawBarStarts: [0.1, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2],
	repair: null,
	cost: 0.05,
	controlCost: 0.5,
	ratio: 10,
	localCost: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
	localMedian: 0.05,
	samePiece: true,
	chartBar: 2.4,
	beatsPerBar: 4,
	hopSec: 0.093,
	firstSound: 0,
	lastSound: 16,
	...over,
});
/** Not this recording: listen's gate said no. */
const notThis = { ratio: 1.2, samePiece: false };

describe("alignedPlacements", () => {
	test("sections, key and tempo changes at their bars; the first and last sections hedged; a first section near 0 at 0", () => {
		const placed = alignedPlacements(alignment(), bars);
		expect(placed.sections).toEqual([
			{ name: "Intro", start: 0, hedged: true },
			{ name: "Verse", start: 4.4, hedged: false },
			{ name: "Chorus", start: 8.4, hedged: false },
			{ name: "Outro", start: 12, hedged: true },
		]);
		expect(placed.keyChanges).toEqual([{ at: 8.4, key: "E major", hedged: false }]);
		expect(placed.tempoChanges).toEqual([{ at: 10.4, bpm: 120, hedged: false }]);
		expect(placed.ratio).toBe(10);
		expect(placed.samePiece).toBe(true);
	});

	test("a one-bar meter's own bpm is not a tempo change; the song's tempo is what changes", () => {
		// A [6/8] bar in 4/4 at 100 counts its eighths at 200 and keeps the tempo at 100.
		const odd = bars.map((b, i) => (i === 1 ? bar({ meter: "6/8", bpm: 200, tempo: 100 }) : b));
		expect(alignedPlacements(alignment(), odd).tempoChanges).toEqual([
			{ at: 10.4, bpm: 120, hedged: false },
		]);
	});

	test("4/4 at 120 going to 6/8 at the same dotted-quarter pulse is a change to 360 eighths in the song's unit", () => {
		const read = barmarkChartBars("time: 4/4, tempo: 120\n| C | G |\ntime: 6/8\n| F | C |\n", {
			tempo: null,
			meter: null,
		})!;
		expect(read.bars.map((b) => b.tempo ?? b.bpm)).toEqual([120, 120, 360, 360]);
		const placed = alignedPlacements(alignment({ barStarts: [0, 2, 4, 5, 6] }), read.bars);
		expect(placed.tempoChanges).toEqual([{ at: 4, bpm: 360, hedged: false }]);
	});

	test("a section a score's read names in a bar's words is placed (barmark's own reading names only headings and rehearsal marks)", () => {
		const read = barmarkChartBars('time: 4/4, tempo: 120\n| C | G |\n| "Chorus" F | C |\n', {
			tempo: null,
			meter: null,
		})!;
		expect(read.bars.map((b) => b.section)).toEqual([null, null, "Chorus", null]);
		const placed = alignedPlacements(alignment({ barStarts: [0, 2, 4, 6, 8] }), read.bars);
		expect(placed.sections.map((s) => [s.name, s.start])).toEqual([["Chorus", 4]]);
	});

	test("a bar whose local cost is over twice the median hedges what is placed there", () => {
		const localCost = [0.05, 0.05, 0.05, 0.05, 0.2, 0.05, 0.05, 0.05];
		const placed = alignedPlacements(alignment({ localCost }), bars);
		expect(placed.sections.find((s) => s.name === "Chorus")?.hedged).toBe(true);
		expect(placed.keyChanges[0]?.hedged).toBe(true);
		expect(placed.tempoChanges[0]?.hedged).toBe(false);
	});

	test("a chart that is not this recording hedges everything", () => {
		const placed = alignedPlacements(alignment(notThis), bars);
		expect(placed.ratio).toBe(1.2);
		expect(placed.samePiece).toBe(false);
		expect(
			[...placed.sections, ...placed.keyChanges, ...placed.tempoChanges].every((p) => p.hedged),
		).toBe(true);
	});

	test("not this recording: a first section later than a quarter second keeps its time, one within it starts at 0", () => {
		const late = alignedPlacements(
			alignment({ barStarts: [0.6, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2], ...notThis }),
			bars,
		);
		expect(late.sections[0]?.start).toBe(0.6);
		expect(late.sections.at(-1)?.start).toBe(12);
		const near = alignedPlacements(
			alignment({ barStarts: [0.2, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2], ...notThis }),
			bars,
		);
		expect(near.sections[0]?.start).toBe(0);
	});

	test("nothing is before 0", () => {
		const early = alignedPlacements(alignment({ barStarts: [-2, -1, 1] }), [
			bar({}),
			bar({ key: "G major" }),
		]);
		expect(early.keyChanges[0]?.at).toBe(0);
	});

	test("FIRST-ONSET: a first section at the chart's first bar starts at the first sound, hedged, only when the chart is this recording", () => {
		const late = { barStarts: [7.15, 9, 11, 13, 15, 17, 19, 21, 23], lastSound: 25 };
		const placed = alignedPlacements(alignment({ ...late, firstSound: 0.02 }), bars);
		expect(placed.sections[0]).toEqual({ name: "Intro", start: 0.02, hedged: true });
		const other = alignedPlacements(alignment({ ...late, firstSound: 0.02, ...notThis }), bars);
		expect(other.sections[0]?.start).toBe(7.15);
		// A chart whose first section starts after its first bar keeps the path's time.
		const unmarked = [bar({}), ...bars.slice(1)];
		const kept = alignedPlacements(alignment({ ...late, firstSound: 0.02 }), unmarked);
		expect(kept.sections[0]).toEqual({ name: "Verse", start: 11, hedged: true });
	});

	test("LAST-SOUND: the last section starts its chart length before the last sound, hedged, never within a bar of the section before", () => {
		// The Outro is two bars at 120 in 4/4: four seconds.
		const placed = alignedPlacements(alignment({ lastSound: 20.03 }), bars);
		expect(placed.sections.at(-1)?.name).toBe("Outro");
		expect(placed.sections.at(-1)?.start).toBeCloseTo(16.03);
		expect(placed.sections.at(-1)?.hedged).toBe(true);
		// A last sound too early for the outro: one bar (2.4 s at 100) after the Chorus at 8.4.
		const floored = alignedPlacements(alignment({ lastSound: 9 }), bars);
		expect(floored.sections.at(-1)?.start).toBeCloseTo(10.8);
		const other = alignedPlacements(alignment({ lastSound: 20.03, ...notThis }), bars);
		expect(other.sections.at(-1)?.start).toBe(12);
	});

	test("a chart of one section is untouched by LAST-SOUND", () => {
		const one = [bar({ section: "Song" }), bar({}), bar({})];
		const placed = alignedPlacements(
			alignment({ barStarts: [0, 2.4, 4.8, 7.2], firstSound: 0.3, lastSound: 30 }),
			one,
		);
		expect(placed.sections).toEqual([{ name: "Song", start: 0.3, hedged: true }]);
	});
});
