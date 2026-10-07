import { describe, expect, it } from "vite-plus/test";
import { rulerTicks } from "./rulerTicks";

describe("rulerTicks", () => {
	it("marks every bar with beats between at a comfortable zoom", () => {
		// 120 bpm, 4/4: a bar is 2 s = 80 px at 40 px/s, a beat 20 px.
		const ticks = rulerTicks({
			seconds: 4,
			pxPerSecond: 40,
			grid: { on: true, bpm: 120, beatsPerBar: 4 },
		});
		expect(ticks.filter((t) => t.major).map((t) => [t.x, t.label])).toEqual([
			[0, "1"],
			[80, "2"],
		]);
		expect(ticks.filter((t) => !t.major).map((t) => t.x)).toEqual([20, 40, 60, 100, 120, 140]);
	});
	it("drops the beats and thins the labels when zoomed out", () => {
		// A bar is 16 px at 8 px/s: labels every 3 bars (48 px), no beat ticks.
		const ticks = rulerTicks({
			seconds: 20,
			pxPerSecond: 8,
			grid: { on: true, bpm: 120, beatsPerBar: 4 },
		});
		expect(ticks.every((t) => t.major)).toBe(true);
		expect(ticks.map((t) => t.label)).toEqual([
			"1",
			null,
			null,
			"4",
			null,
			null,
			"7",
			null,
			null,
			"10",
		]);
	});
	it("labels seconds on a ladder in free time", () => {
		const ticks = rulerTicks({
			seconds: 30,
			pxPerSecond: 40,
			grid: { on: false, bpm: 120, beatsPerBar: 4 },
		});
		// 2 s steps are 80 px apart, the first step that reaches 70 px.
		expect(ticks.slice(0, 3).map((t) => [t.x, t.label])).toEqual([
			[0, "0:00"],
			[80, "0:02"],
			[160, "0:04"],
		]);
	});
	it("uses tenths of a second when zoomed far in", () => {
		const ticks = rulerTicks({
			seconds: 2,
			pxPerSecond: 200,
			grid: { on: false, bpm: 120, beatsPerBar: 4 },
		});
		expect(ticks[1]).toEqual({ x: 100, label: "0:00.5", major: true });
	});
	it("covers the whole span", () => {
		const ticks = rulerTicks({
			seconds: 7,
			pxPerSecond: 40,
			grid: { on: true, bpm: 120, beatsPerBar: 4 },
		});
		// Four bars begin inside 7 s; the last bar's beat ticks may run past it, which the lane clips.
		const major = ticks.filter((t) => t.major);
		expect(major).toHaveLength(4);
		expect(Math.max(...major.map((t) => t.x))).toBeLessThan(7 * 40);
	});
});
