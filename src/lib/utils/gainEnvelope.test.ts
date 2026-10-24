import { describe, expect, test } from "vite-plus/test";
import { gainEnvelopeAt, gainEnvelopeRamps, gainEnvelopeWith } from "./gainEnvelope.js";

const points = [
	{ t: 1, v: 1 },
	{ t: 2, v: 0.5 },
	{ t: 4, v: 1.5 },
];

describe("gainEnvelope", () => {
	test("the factor is one without points, held flat outside them and a line between", () => {
		expect(gainEnvelopeAt(undefined, 3)).toBe(1);
		expect(gainEnvelopeAt([], 3)).toBe(1);
		expect(gainEnvelopeAt(points, 0)).toBe(1);
		expect(gainEnvelopeAt(points, 1.5)).toBeCloseTo(0.75, 9);
		expect(gainEnvelopeAt(points, 3)).toBeCloseTo(1, 9);
		expect(gainEnvelopeAt(points, 9)).toBe(1.5);
	});

	test("ramps over a span start and end at the span, with the points inside", () => {
		expect(gainEnvelopeRamps(points, 1.5, 3)).toEqual([
			{ t: 1.5, v: 0.75 },
			{ t: 2, v: 0.5 },
			{ t: 3, v: 1 },
		]);
		// Flat at one, or an empty span: nothing to schedule.
		expect(gainEnvelopeRamps([{ t: 0, v: 1 }], 0, 4)).toEqual([]);
		expect(gainEnvelopeRamps(points, 3, 3)).toEqual([]);
	});

	test("a point set replaces one at the same second, keeps time order and clamps the value", () => {
		expect(gainEnvelopeWith(points, { t: 3, v: 2.5 })).toEqual([
			{ t: 1, v: 1 },
			{ t: 2, v: 0.5 },
			{ t: 3, v: 2 },
			{ t: 4, v: 1.5 },
		]);
		expect(gainEnvelopeWith(points, { t: 2.0002, v: 0.25 })).toEqual([
			{ t: 1, v: 1 },
			{ t: 2.0002, v: 0.25 },
			{ t: 4, v: 1.5 },
		]);
		expect(gainEnvelopeWith(undefined, { t: -1, v: -3 })).toEqual([{ t: 0, v: 0 }]);
	});
});
