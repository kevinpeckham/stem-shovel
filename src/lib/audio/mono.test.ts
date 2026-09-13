import { fakeAudioBuffer, fakeContext } from "../../../tests/helpers/fakeAudioBuffer";
import { describe, expect, test } from "vite-plus/test";
import { collapseDualMono } from "./mono";
import { computePeaks } from "./peaks";

describe("collapseDualMono", () => {
	const ctx = fakeContext();
	test("a stereo file whose channels match becomes one channel", () => {
		const left = Float32Array.from([0.1, -0.2, 0.3, 0.0]);
		const right = Float32Array.from([0.1, -0.2 + 1e-4, 0.3, 0.0]);
		const out = collapseDualMono(fakeAudioBuffer([left, right]), ctx);
		expect(out.numberOfChannels).toBe(1);
		expect(Array.from(out.getChannelData(0))).toEqual(Array.from(left));
	});
	test("real stereo is left alone", () => {
		const buffer = fakeAudioBuffer([Float32Array.from([0.5, 0.5]), Float32Array.from([-0.5, 0.5])]);
		expect(collapseDualMono(buffer, ctx)).toBe(buffer);
	});
	test("mono is returned as is", () => {
		const buffer = fakeAudioBuffer([Float32Array.from([0.5, 0.5])]);
		expect(collapseDualMono(buffer, ctx)).toBe(buffer);
	});
});

describe("computePeaks", () => {
	test("max absolute value per bin across channels", () => {
		const left = Float32Array.from([0.1, 0.9, 0.2, 0.2]);
		const right = Float32Array.from([0.3, 0.1, -0.7, 0.0]);
		const peaks = Array.from(computePeaks(fakeAudioBuffer([left, right]), 2));
		expect(peaks[0]).toBeCloseTo(0.9, 5); // Float32 in, Float32 out
		expect(peaks[1]).toBeCloseTo(0.7, 5);
	});
	test("silence gives zeros", () => {
		expect(Array.from(computePeaks(fakeAudioBuffer([new Float32Array(8)]), 4))).toEqual([
			0, 0, 0, 0,
		]);
	});
});
