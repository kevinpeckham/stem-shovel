import { describe, expect, test } from "vite-plus/test";
import { decodeDrumPattern } from "./decodeDrumPattern";
import { drumStepTime } from "./drumStepTime";
import { encodeDrumPattern } from "./encodeDrumPattern";
import { resizeDrumPattern } from "./resizeDrumPattern";
import { startingDrumPattern } from "./startingDrumPattern";
import type { DrumPattern } from "$lib/val/DrumPatternSchema";

/**
 * Links that have been shared are pinned here and this list only grows: a
 * change to the codec that reads one of them differently breaks a link
 * someone has. Each is the starting pattern, or a variation named beside it.
 */
const PINNED_LINKS: [string, () => DrumPattern][] = [
	["ATwAkBaQEBAQA0ABAAEATxERERAGyAAAABCRgAAAAAsYAAAAANQAAAAAEUAAAAAA", startingDrumPattern],
	[
		"AaRkJhkQQQYCAAFsmJEA",
		() => ({
			v: 1,
			bpm: 204,
			swing: 0.5,
			steps: 8,
			kit: "electronic",
			rows: [
				{ voice: "kick", level: 1, mute: false, cells: [2, 0, 0, 2, 0, 0, 2, 0] },
				{ voice: "hat-open", level: 0, mute: true, cells: [0, 0, 0, 0, 0, 0, 0, 0] },
				{ voice: "cowbell", level: 0.5, mute: false, cells: [3, 0, 1, 0, 2, 0, 2, 0] },
			],
		}),
	],
];

describe("encodeDrumPattern / decodeDrumPattern", () => {
	test("round-trips the starting pattern in under 70 characters", () => {
		const p = startingDrumPattern();
		const s = encodeDrumPattern(p);
		expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(s.length).toBeLessThan(80);
		expect(decodeDrumPattern(s)).toEqual(p);
	});
	test("keeps level to a hundredth", () => {
		const p = { ...startingDrumPattern(), rows: startingDrumPattern().rows.slice(0, 1) };
		p.rows[0]!.level = 0.3333;
		expect(decodeDrumPattern(encodeDrumPattern(p))!.rows[0]!.level).toBe(0.33);
	});
	test("32 steps, every kit and voice", () => {
		const p = resizeDrumPattern(startingDrumPattern(), 32);
		p.kit = "electronic";
		p.rows.push({ voice: "cowbell", level: 1, mute: true, cells: Array(32).fill(3) });
		expect(decodeDrumPattern(encodeDrumPattern(p))).toEqual(p);
	});
	test("refuses what is not a link", () => {
		expect(decodeDrumPattern("")).toBeNull();
		expect(decodeDrumPattern("not a link")).toBeNull();
		expect(decodeDrumPattern("AA")).toBeNull();
		// A version this build does not read
		expect(decodeDrumPattern("Ag")).toBeNull();
	});
	test("pinned links still open as the patterns they were", () => {
		for (const [link, pattern] of PINNED_LINKS) {
			const p = pattern();
			expect(decodeDrumPattern(link)).toEqual(p);
			expect(encodeDrumPattern(p)).toBe(link);
		}
	});
});

describe("resizeDrumPattern", () => {
	test("growing repeats the bar, shrinking keeps the start", () => {
		const p = startingDrumPattern();
		const two = resizeDrumPattern(p, 32);
		expect(two.steps).toBe(32);
		expect(two.rows[0]!.cells).toEqual([...p.rows[0]!.cells, ...p.rows[0]!.cells]);
		const half = resizeDrumPattern(p, 8);
		expect(half.rows[0]!.cells).toEqual(p.rows[0]!.cells.slice(0, 8));
		expect(resizeDrumPattern(p, 16)).toBe(p);
	});
});

describe("drumStepTime", () => {
	test("sixteenths at the tempo", () => {
		expect(drumStepTime(0, 120, 0)).toBe(0);
		expect(drumStepTime(4, 120, 0)).toBeCloseTo(0.5);
		expect(drumStepTime(16, 60, 0)).toBeCloseTo(4);
	});
	test("swing pushes the off-sixteenths late, up to a third of a step", () => {
		expect(drumStepTime(1, 120, 0)).toBeCloseTo(0.125);
		expect(drumStepTime(1, 120, 1)).toBeCloseTo(0.125 + 0.125 / 3);
		expect(drumStepTime(2, 120, 1)).toBeCloseTo(0.25);
		expect(drumStepTime(3, 120, 0.5)).toBeCloseTo(0.375 + 0.125 / 6);
	});
});
