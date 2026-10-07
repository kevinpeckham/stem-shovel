import { describe, expect, it } from "vite-plus/test";
import { fakeAudioBuffer } from "../../../tests/helpers/fakeAudioBuffer";
import { normalizeBuffer } from "./normalizeBuffer";

describe("normalizeBuffer", () => {
	it("lifts a quiet take to the target across every channel", () => {
		const buffer = fakeAudioBuffer([new Float32Array([0.1, -0.3]), new Float32Array([0.2, 0.05])]);
		const k = normalizeBuffer(buffer);
		expect(k).toBeCloseTo(0.891 / 0.3);
		expect(buffer.getChannelData(0)[1]).toBeCloseTo(-0.891);
		expect(buffer.getChannelData(1)[0]).toBeCloseTo(0.2 * k);
	});
	it("leaves a loud take and a near-silent one alone", () => {
		const loud = fakeAudioBuffer([new Float32Array([0.95, -0.2])]);
		expect(normalizeBuffer(loud)).toBe(1);
		expect(loud.getChannelData(0)[0]).toBeCloseTo(0.95);
		const silent = fakeAudioBuffer([new Float32Array([0.005, -0.009])]);
		expect(normalizeBuffer(silent)).toBe(1);
		expect(silent.getChannelData(0)[1]).toBeCloseTo(-0.009);
	});
});
