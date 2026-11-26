import { describe, expect, test } from "vite-plus/test";
import type { PlacedGrid } from "@barmark/listen";
import { chartlessGridUse } from "./chartlessGridUse";

/** @barmark/listen's placed grid: bars every `period` from `bars[0]`, the lattice `beatsPerBar` beats a bar. */
const grid = (period: number, beatsPerBar = 4, bars = [0, period]): PlacedGrid => ({
	grid: { bars },
	pickup: null,
	reading: {
		comb: { period, phase: 0, score: 1 },
		lattice: { anchor: 0, beat: period / beatsPerBar, period, beatsPerBar },
		witnesses: [],
		scores: [],
		cls: 0,
		decided: true,
		byStart: false,
	},
});

describe("chartlessGridUse", () => {
	test("the bar as a tempo, to two decimals", () => {
		expect(chartlessGridUse(grid(1.8181818)).bpm).toBe(132);
		expect(chartlessGridUse(grid(2.4)).bpm).toBe(100);
		expect(chartlessGridUse(grid(240 / 87.5)).bpm).toBe(87.5);
		expect(chartlessGridUse(grid(1.8)).bpm).toBe(133.33);
	});
	test("a 3/4 bar counts three beats; a 6/8 bar six eighths, the song's unit", () => {
		expect(chartlessGridUse(grid(1.5, 3)).bpm).toBe(120);
		expect(chartlessGridUse(grid(3, 6)).bpm).toBe(120);
	});
	test("the start is the placed bar one, after any pickup", () => {
		expect(chartlessGridUse(grid(2, 4, [0.37, 2.37, 4.37])).startAt).toBe(0.37);
		const withPickup = { ...grid(2, 4, [1.5, 3.5]), pickup: { start: 0.5, beats: 2 } };
		expect(chartlessGridUse(withPickup).startAt).toBe(1.5);
	});
});
