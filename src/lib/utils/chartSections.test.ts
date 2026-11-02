import { describe, expect, it } from "vite-plus/test";
import type { BarGrid } from "#lib/audio/measures.js";
import { chartSections } from "./chartSections";

const grid = (bpm: number, beatsPerBar = 4): BarGrid => ({
	tempos: [{ start: 0, bpm }],
	meters: [{ start: 0, beatsPerBar }],
	startAt: 0,
});
const g120 = grid(120);

describe("chartSections", () => {
	it("starts a section at each heading, a replay included", () => {
		const text =
			"tempo: 120\n\n## Verse\n| G | D | Em | C |\n\n## Chorus\n| C | G | D | D |\n\n## Verse\n";
		const r = chartSections(text, { grid: g120, from: 0 });
		expect(r.sections.map((s) => [s.name, s.bar])).toEqual([
			["Verse", 1],
			["Chorus", 5],
			["Verse", 9],
		]);
		expect(r.bars).toBe(12);
		expect(r.errors).toEqual([]);
	});
	it("times the bars by the chart's tempo from the playhead", () => {
		const text = "time: 4/4\ntempo: 120\n\n## Verse\n| G | D | Em | C |\n\n## Chorus\n| C | G |";
		const r = chartSections(text, { grid: grid(90), from: 3 });
		expect(r.sections.map((s) => s.start)).toEqual([3, 11]);
		expect(r.seconds).toBe(15);
		expect(r.warnings).toEqual([]);
	});
	it("places a chart without a tempo on the Studio's bar lines", () => {
		// 100 bpm in 4/4: a bar is 2.4 s, so the playhead at 2.4 s is the top of bar 2.
		const r = chartSections("## A\n| G | D |\n## B\n| C |", { grid: grid(100), from: 2.4 });
		expect(r.sections.map((s) => [s.name, s.start])).toEqual([
			["A", 2.4],
			["B", expect.closeTo(7.2, 6)],
		]);
		expect(r.seconds).toBeCloseTo(9.6, 6);
		expect(r.warnings).toEqual([
			"the chart names no tempo; its bars were placed on the Studio's grid",
		]);
	});
	it("starts from the bar holding the playhead when it sits mid-bar", () => {
		const r = chartSections("## A\n| G |", { grid: grid(100), from: 3 });
		expect(r.sections[0]?.start).toBeCloseTo(2.4, 6);
	});
	it("warns when the chart's meter differs from the Studio's", () => {
		const r = chartSections("time: 3/4\n## A\n| G | D |", { grid: g120, from: 0 });
		expect(r.warnings).toContain(
			"the chart is in 3/4 and the Studio in 4/4; bars will not line up",
		);
	});
	it("names bars before any heading Section", () => {
		const r = chartSections("tempo: 60\n| G | D |\n## A\n| C |", { grid: g120, from: 0 });
		expect(r.sections.map((s) => [s.name, s.start])).toEqual([
			["Section", 0],
			["A", 8],
		]);
	});
	it("reports errors by line", () => {
		const r = chartSections("## A\n| Q7#x | D |", { grid: g120, from: 0 });
		expect(r.errors[0]).toMatch(/^line 2: /);
	});
	it("reports a chart with no bars", () => {
		const r = chartSections("key: G\n", { grid: g120, from: 1 });
		expect(r).toEqual({
			sections: [],
			bars: 0,
			seconds: 1,
			warnings: [],
			errors: ["the chart has no bars"],
		});
	});
	it("cuts a name to 40 characters", () => {
		const r = chartSections(`tempo: 120\n## ${"x".repeat(60)}\n| G |`, { grid: g120, from: 0 });
		expect(r.sections[0]?.name).toBe("x".repeat(40));
	});
});
