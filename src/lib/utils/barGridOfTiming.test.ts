import { describe, expect, it } from "vite-plus/test";
import { chartHash, type TimingMap } from "@barmark/sync";
import { barAt, barGrid, secondsAtBar } from "#lib/audio/measures.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { barGridOfTiming, songGrid } from "./barGridOfTiming";

const mapOf = (starts: number[], end: number, extra: Partial<TimingMap> = {}): TimingMap => ({
	format: "barmark-timing",
	version: 1,
	chart: { bars: starts.length, hash: "h" },
	source: "detected",
	bars: starts.map((start, i) => ({ bar: i + 1, start })),
	end,
	...extra,
});

const declared: SongChange[] = [
	{ kind: "tempo", start: 0, value: "120" },
	{ kind: "meter", start: 0, value: "4/4" },
];

describe("barGridOfTiming", () => {
	it("puts every bar line on an entry's start", () => {
		const starts = [0.5, 2.5, 4.4, 6.5];
		const grid = barGridOfTiming(mapOf(starts, 8.6), [])!;
		expect(grid.startAt).toBe(0.5);
		expect(grid.meters).toEqual([{ start: 0, beatsPerBar: 4 }]);
		expect(grid.tempos[0]).toEqual({ start: 0.5, bpm: 120 });
		starts.forEach((s, i) => {
			expect(secondsAtBar(grid, i + 1)).toBeCloseTo(s, 9);
			expect(barAt(grid, s + 1e-6)).toMatchObject({ bar: i + 1, beat: 1 });
		});
		// The last bar runs to the map's end.
		expect(grid.tempos.at(-1)!.bpm).toBeCloseTo((4 * 60) / 2.1, 9);
		expect(barAt(grid, 8.6 + 1e-6)).toMatchObject({ bar: 5, beat: 1 });
	});

	it("takes the beats per bar from the song's meter changes", () => {
		const grid = barGridOfTiming(mapOf([0, 3, 5], 7), [
			{ kind: "meter", start: 0, value: "3/4" },
			{ kind: "meter", start: 5, value: "6/8" },
		])!;
		expect(grid.tempos.map((t) => t.bpm)).toEqual([60, 90, 180]);
		expect(barAt(grid, 5.0001)).toMatchObject({ bar: 3, beat: 1 });
	});

	it("ends the last bar at its own end when it has one", () => {
		const map = mapOf([0, 2], 5);
		map.bars[1]!.end = 4;
		expect(barGridOfTiming(map, [])!.tempos[1]!.bpm).toBe(120);
	});

	it("reads bar 1 at 0:00 when the map's bar 1 sits just before it", () => {
		// A repaired alignment put bar 1 at -0.046 s; the song's 4/4 starts at 0:00.
		const map = mapOf([-0.046, 1.773, 3.591, 5.409], 7.227);
		const grid = barGridOfTiming(map, declared)!;
		expect(grid.meters[0]!.start).toBe(-0.046);
		expect(barAt(grid, 0)).toMatchObject({ bar: 1, beat: 1 });
		expect(barAt(grid, 1.8)).toMatchObject({ bar: 2, beat: 1 });
	});

	it("counts repeated bars in recording order", () => {
		const map = mapOf([0, 2, 4], 6);
		map.bars = [
			{ bar: 1, start: 0 },
			{ bar: 2, start: 2 },
			{ bar: 1, start: 4 },
		];
		expect(barAt(barGridOfTiming(map, [])!, 4.0001).bar).toBe(3);
	});

	describe("written numbers", () => {
		const chart = "|: C | G :|\n| Am |";
		const repeat = (hash: string) => mapOf([0, 2, 4, 6, 8], 10, { chart: { bars: 5, hash } });
		it("numbers the bars as the chart the map was built for writes them", () => {
			expect(barGridOfTiming(repeat(chartHash(chart)), [], chart)!.written).toEqual([
				1, 2, 1, 2, 3,
			]);
		});
		it("has none for another chart's text or without one", () => {
			expect(barGridOfTiming(repeat("other"), [], chart)!.written).toBeUndefined();
			expect(barGridOfTiming(repeat(chartHash(chart)), [])!.written).toBeUndefined();
			expect(barGridOfTiming(repeat(chartHash("")), [], "")!.written).toBeUndefined();
		});
		it("passes through songGrid", () => {
			expect(songGrid([], 0, repeat(chartHash(chart)), true, chart)!.written).toEqual([
				1, 2, 1, 2, 3,
			]);
		});
	});

	it("is null for an empty map or a span that is not positive", () => {
		expect(barGridOfTiming(mapOf([], 4), [])).toBeNull();
		expect(barGridOfTiming(mapOf([0, 2], 2), [])).toBeNull();
		expect(barGridOfTiming(mapOf([0, 0], 4), [])).toBeNull();
		expect(barGridOfTiming(mapOf([2, 1], 4), [])).toBeNull();
	});
});

describe("songGrid", () => {
	const map = mapOf([1, 3], 5);
	it("follows the map only when asked and it makes a grid", () => {
		expect(songGrid(declared, 0, map, true)).toEqual(barGridOfTiming(map, declared));
		expect(songGrid(declared, 0, map, false)).toEqual(barGrid(declared, 0));
		expect(songGrid(declared, 0, null, true)).toEqual(barGrid(declared, 0));
		expect(songGrid(declared, 0, mapOf([0, 0], 1), true)).toEqual(barGrid(declared, 0));
	});
});
