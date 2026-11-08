import { describe, expect, test } from "vite-plus/test";
import type { ChartlessGrid } from "#lib/audio/chartlessGrid.js";
import { chartlessGridUse } from "./chartlessGridUse";

const grid = (period: number, beatsPerBar = 4, barStarts = [0, period]): ChartlessGrid => ({
	barStarts,
	period,
	beatsPerBar,
	cls: 0,
	decided: true,
	byStart: false,
	witnesses: [],
});

describe("chartlessGridUse", () => {
	test("the bar as a tempo, to two decimals", () => {
		expect(chartlessGridUse(grid(1.8181818)).bpm).toBe(132);
		expect(chartlessGridUse(grid(2.4)).bpm).toBe(100);
		expect(chartlessGridUse(grid(240 / 87.5)).bpm).toBe(87.5);
		expect(chartlessGridUse(grid(1.8)).bpm).toBe(133.33);
	});
	test("a 3/4 bar counts three beats", () => {
		expect(chartlessGridUse(grid(1.5, 3)).bpm).toBe(120);
	});
	test("the start is the placed bar one", () => {
		expect(chartlessGridUse(grid(2, 4, [0.37, 2.37, 4.37])).startAt).toBe(0.37);
	});
});
