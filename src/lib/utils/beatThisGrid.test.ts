import { describe, expect, test } from "vite-plus/test";
import { beatThisGrid } from "./beatThisGrid";

/** `bars` bars of `perBar` beats at `bpm`, with a final downbeat closing the last bar. */
function grid(bpm: number, perBar: number, bars: number): { beats: number[]; downbeats: number[] } {
	const beats = Array.from({ length: perBar * bars + 1 }, (_, i) => (i * 60) / bpm);
	const downbeats = beats.filter((_, i) => i % perBar === 0);
	return { beats, downbeats };
}

describe("beatThisGrid", () => {
	test("the worked example: 143 bpm, 6 a bar is 6/8 at 48 dotted quarters", () => {
		const { beats, downbeats } = grid(143, 6, 8);
		expect(beatThisGrid(beats, downbeats)).toEqual({
			tempo: 143,
			beatsPerBar: 6,
			meter: "6/8",
			chartTempo: 48,
			counts: { 6: 8 },
		});
	});
	test("3 a bar is 3/4 at the beat tempo", () => {
		const { beats, downbeats } = grid(90, 3, 6);
		const g = beatThisGrid(beats, downbeats);
		expect([g.meter, g.tempo, g.chartTempo, g.beatsPerBar]).toEqual(["3/4", 90, 90, 3]);
	});
	test("4 a bar is 4/4", () => {
		const { beats, downbeats } = grid(120, 4, 4);
		expect(beatThisGrid(beats, downbeats)).toMatchObject({
			meter: "4/4",
			tempo: 120,
			chartTempo: 120,
		});
	});
	test("2 a bar (or any other count) reads as 4/4", () => {
		const { beats, downbeats } = grid(100, 2, 5);
		expect(beatThisGrid(beats, downbeats)).toMatchObject({
			beatsPerBar: 2,
			meter: "4/4",
			chartTempo: 100,
		});
		const five = grid(100, 5, 5);
		expect(beatThisGrid(five.beats, five.downbeats)).toMatchObject({
			beatsPerBar: 5,
			meter: "4/4",
		});
	});
	test("a tie between counts takes the smaller", () => {
		// Bars of 4, 3, 4, 3: two each, so 3.
		const beats = Array.from({ length: 15 }, (_, i) => i * 0.5);
		const downbeats = [0, 2, 3.5, 5.5, 7];
		const g = beatThisGrid(beats, downbeats);
		expect(g.counts).toEqual({ 3: 2, 4: 2 });
		expect(g.beatsPerBar).toBe(3);
		expect(g.meter).toBe("3/4");
	});
	test("tempo from the median interval, robust to one odd gap", () => {
		// Intervals 0.5, 0.5, 0.5, 2: median 0.5 → 120 bpm.
		expect(beatThisGrid([0, 0.5, 1, 1.5, 3.5], []).tempo).toBe(120);
		// An even count averages the middle two: 0.5 and 0.6 → 0.55 → 109.09 → 109.
		expect(beatThisGrid([0, 0.5, 1.1, 1.6, 2.2], []).tempo).toBe(109);
	});
	test("too few beats or downbeats gives nulls", () => {
		expect(beatThisGrid([1], [1])).toEqual({
			tempo: null,
			beatsPerBar: null,
			meter: null,
			chartTempo: null,
			counts: {},
		});
		expect(beatThisGrid([0, 0.5, 1], [0])).toMatchObject({
			tempo: 120,
			meter: null,
			chartTempo: 120,
		});
	});
});
