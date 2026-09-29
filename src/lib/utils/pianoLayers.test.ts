import { describe, expect, test } from "vite-plus/test";
import { layerMix, layerVelocity } from "./pianoLayers";

describe("layerMix", () => {
	test("one layer plays alone at any velocity", () => {
		expect(layerMix(0.1, [10])).toEqual([{ layer: 10, gain: 1 }]);
		expect(layerMix(0.9, [10])).toEqual([{ layer: 10, gain: 1 }]);
	});
	test("between two layers the mix crossfades with equal power, and the ends play one layer", () => {
		const layers = [4, 8, 12, 16];
		expect(layerMix(0, layers)).toEqual([{ layer: 4, gain: 1 }]);
		expect(layerMix(1, layers)).toEqual([{ layer: 16, gain: 1 }]);
		const mid = layerMix((layerVelocity(8) + layerVelocity(12)) / 2, layers);
		expect(mid.map((m) => m.layer)).toEqual([8, 12]);
		expect(mid[0]!.gain).toBeCloseTo(Math.SQRT1_2);
		expect(mid[1]!.gain).toBeCloseTo(Math.SQRT1_2);
		const at8 = layerMix(layerVelocity(8), layers);
		expect(at8.map((m) => m.layer)).toEqual([8]);
	});
	test("nothing loaded, nothing to play", () => {
		expect(layerMix(0.5, [])).toEqual([]);
	});
});
