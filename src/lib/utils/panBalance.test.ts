import { describe, expect, it } from "vite-plus/test";
import { panBalance, panWeightsOf } from "./panBalance";

describe("panWeightsOf", () => {
	it("keeps a mono track at unity both sides at center and fades the far side", () => {
		expect(panWeightsOf(0, true)).toEqual({ ll: 1, lr: 0, rl: 1, rr: 0 });
		expect(panWeightsOf(1, true).ll).toBeCloseTo(0, 9);
		expect(panWeightsOf(-1, true).rl).toBeCloseTo(0, 9);
	});
	it("folds a stereo track's far channel into the near one", () => {
		expect(panWeightsOf(0, false)).toEqual({ ll: 1, lr: expect.closeTo(0, 9), rl: 0, rr: 1 });
		expect(panWeightsOf(-1, false)).toEqual({ ll: 1, lr: 1, rl: 0, rr: expect.closeTo(0, 9) });
	});
});

describe("panBalance", () => {
	it("is centered with nothing playing or everything at center", () => {
		expect(panBalance([]).balance).toBe(0);
		expect(panBalance([{ level: 0.5, pan: 0, mono: true }]).balance).toBe(0);
		expect(panBalance([{ level: 0.5, pan: 0, mono: false }]).balance).toBe(0);
	});
	it("leans the way the louder side is panned", () => {
		const b = panBalance([
			{ level: 0.5, pan: 1, mono: true },
			{ level: 0.1, pan: -1, mono: true },
		]);
		expect(b.balance).toBeGreaterThan(0.5);
		expect(panBalance([{ level: 1, pan: -1, mono: false }]).balance).toBe(-1);
	});
	it("ignores silent tracks", () => {
		expect(panBalance([{ level: 0, pan: 1, mono: true }]).balance).toBe(0);
	});
});
