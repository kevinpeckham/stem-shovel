import { describe, expect, it } from "vite-plus/test";
import { velocityLayerPlan, type LayerPlan } from "./velocityLayerPlan";

/** The plan as [layer, source, cut] rows from V5 down, cuts rounded to a hundredth. */
const rows = (plan: LayerPlan | null) =>
	plan &&
	([5, 4, 3, 2, 1] as const).map((l) => [
		l,
		plan[l].source,
		Math.round(plan[l].attenuationDb * 100) / 100,
	]);

describe("velocityLayerPlan", () => {
	it("no V5, not playable", () => {
		expect(velocityLayerPlan({})).toBeNull();
		expect(velocityLayerPlan({ 3: -10, 1: -20 })).toBeNull();
	});
	it("every layer recorded: each plays itself, uncut", () => {
		expect(rows(velocityLayerPlan({ 5: -6, 4: -9, 3: -12, 2: -15, 1: -18 }))).toEqual([
			[5, 5, 0],
			[4, 4, 0],
			[3, 3, 0],
			[2, 2, 0],
			[1, 1, 0],
		]);
	});
	it("V5 only: nothing to measure, the default, 4 dB a step, from V5", () => {
		expect(rows(velocityLayerPlan({ 5: -8 }))).toEqual([
			[5, 5, 0],
			[4, 5, 4],
			[3, 5, 8],
			[2, 5, 12],
			[1, 5, 16],
		]);
	});
	it("an unmeasured V5 (a basic kit) plays the same way", () => {
		expect(rows(velocityLayerPlan({ 5: null }))).toEqual(rows(velocityLayerPlan({ 5: -8 })));
	});
	it("V5 and V3 6 dB apart: V4 is V5 cut 3 dB", () => {
		const plan = velocityLayerPlan({ 5: -6, 3: -12 });
		expect(rows(plan)!.slice(0, 3)).toEqual([
			[5, 5, 0],
			[4, 5, 3],
			[3, 3, 0],
		]);
	});
	it("V5 and V3 7.4 dB apart: 3.7 dB a step, nothing hard-coded", () => {
		expect(velocityLayerPlan({ 5: -6, 3: -13.4 })![4]).toEqual({ source: 5, attenuationDb: 3.7 });
	});
	it("V5 and V1 12 dB apart: four steps of 3 dB, so V2 approaches V1 rather than matching it", () => {
		expect(rows(velocityLayerPlan({ 5: -6, 1: -18 }))).toEqual([
			[5, 5, 0],
			[4, 5, 3],
			[3, 5, 6],
			[2, 5, 9],
			[1, 1, 0],
		]);
	});
	it("V5 and V2 12 dB apart: 4 dB steps between, and V1 below V2 at the average step, 4 dB", () => {
		expect(rows(velocityLayerPlan({ 5: -6, 2: -18 }))).toEqual([
			[5, 5, 0],
			[4, 5, 4],
			[3, 5, 8],
			[2, 2, 0],
			[1, 2, 4],
		]);
	});
	it("below the lowest, the average counts every layer above it, filled-in ones too", () => {
		// V5 -6, V4 -7 (1 dB), V3 empty, V2 -17 (V4 to V2: 10 dB, 5 a step): steps 1, 5, 5 average 11/3.
		const plan = velocityLayerPlan({ 5: -6, 4: -7, 2: -17 })!;
		expect(plan[3]).toEqual({ source: 4, attenuationDb: 5 });
		expect(plan[1].source).toBe(2);
		expect(plan[1].attenuationDb).toBeCloseTo(11 / 3, 10);
	});
	it("a small average falls back to the 2.5 dB minimum", () => {
		expect(rows(velocityLayerPlan({ 5: -6, 4: -7 }))!.slice(2)).toEqual([
			[3, 4, 2.5],
			[2, 4, 5],
			[1, 4, 7.5],
		]);
	});
	it("a lower layer louder than the one above: no cut between, never a boost, and the minimum below", () => {
		expect(rows(velocityLayerPlan({ 5: -10, 3: -6 }))).toEqual([
			[5, 5, 0],
			[4, 5, 0],
			[3, 3, 0],
			[2, 3, 2.5],
			[1, 3, 5],
		]);
	});
	it("an unmeasured layer in a gap: the default step there", () => {
		expect(velocityLayerPlan({ 5: -6, 3: null })![4]).toEqual({ source: 5, attenuationDb: 4 });
	});
	it("an unmeasured layer above the lowest: the default step below it", () => {
		expect(rows(velocityLayerPlan({ 5: -6, 3: null }))!.slice(3)).toEqual([
			[2, 3, 4],
			[1, 3, 8],
		]);
	});
	it("silence measured as -Infinity counts as unmeasured, not as an infinite gap", () => {
		expect(velocityLayerPlan({ 5: -6, 3: -Infinity })![4]).toEqual({ source: 5, attenuationDb: 4 });
	});
});
