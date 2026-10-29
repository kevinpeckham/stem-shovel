import { describe, expect, test } from "vite-plus/test";
import { tempoLadderMatch } from "./tempoLadderMatch.js";

describe("tempoLadderMatch", () => {
	test("direct, double and half", () => {
		expect(tempoLadderMatch(121, 120)).toEqual({ factor: 1 });
		expect(tempoLadderMatch(224, 112)).toEqual({ factor: 2 });
		expect(tempoLadderMatch(112, 224)).toEqual({ factor: 0.5 });
		expect(tempoLadderMatch(130, 120)).toBeNull();
	});
	test("the 3:2 rungs only on compound evidence", () => {
		expect(tempoLadderMatch(120, 80, { compound: true })).toEqual({ factor: 1.5 });
		expect(tempoLadderMatch(120, 80)).toBeNull();
		expect(tempoLadderMatch(145, 96.7)).toBeNull();
		expect(tempoLadderMatch(145, 96.7, { compound: true })).toEqual({ factor: 1.5 });
		expect(tempoLadderMatch(80, 120, { compound: true })).toEqual({ factor: 2 / 3 });
	});
	test("tolerance is absolute bpm", () => {
		expect(tempoLadderMatch(125, 120)).toBeNull();
		expect(tempoLadderMatch(125, 120, { tolerance: 5 })).toEqual({ factor: 1 });
		expect(tempoLadderMatch(121, 120, { tolerance: 0.5 })).toBeNull();
	});
	test("non-finite or non-positive tempos match nothing", () => {
		for (const [a, b] of [
			[0, 120],
			[120, 0],
			[-120, -120],
			[Number.NaN, 120],
			[120, Number.POSITIVE_INFINITY],
		]) {
			expect(tempoLadderMatch(a!, b!)).toBeNull();
		}
	});
});
