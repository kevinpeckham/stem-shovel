import { fakeAudioBuffer, fakeContext } from "../../../tests/helpers/fakeAudioBuffer";
import { describe, expect, test } from "vite-plus/test";
import { collapseDualMono } from "./mono";
import { combinePeaks, computeMixPeaks, computePeaks } from "./peaks";

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

describe("computeMixPeaks", () => {
	test("sums the stems before taking the peak, so cancelling stems cancel", () => {
		const a = fakeAudioBuffer([Float32Array.from([0.5, 0.5, 0.2, 0.2])]);
		const b = fakeAudioBuffer([Float32Array.from([-0.5, -0.5, 0.2, 0.2])]);
		expect(Array.from(computeMixPeaks([a, b], 2))).toEqual([0, 1]);
	});
	test("averages channels, spans the longest stem and normalises to 1", () => {
		const stereo = fakeAudioBuffer([Float32Array.from([0.4, 0.4]), Float32Array.from([0.2, 0.2])]);
		const long = fakeAudioBuffer([Float32Array.from([0.1, 0.1, 0.6, 0.6])]);
		const peaks = Array.from(computeMixPeaks([stereo, long], 2));
		// bin 0: (0.4+0.2)/2 + 0.1 = 0.4; bin 1: 0.6 (stereo has ended)
		expect(peaks[0]).toBeCloseTo(0.4 / 0.6, 5);
		expect(peaks[1]).toBeCloseTo(1, 5);
	});
	test("no buffers or silence give zeros", () => {
		expect(Array.from(computeMixPeaks([], 2))).toEqual([0, 0]);
		expect(Array.from(computeMixPeaks([fakeAudioBuffer([new Float32Array(4)])], 2))).toEqual([
			0, 0,
		]);
	});
});

describe("combinePeaks", () => {
	test("places each stem's bins on the song length and combines them", () => {
		const stems = [
			{ peaks: [0.6, 0.8], duration: 10 },
			{ peaks: [0.8], duration: 5 }, // ends halfway through the song
		];
		const peaks = combinePeaks(stems, 10, 2);
		// bin 0: sqrt(0.36 + 0.64) = 1; bin 1: 0.8 (second stem is over)
		expect(peaks[0]).toBeCloseTo(1, 5);
		expect(peaks[1]).toBeCloseTo(0.8, 5);
	});
	test("no stems or no duration give zeros", () => {
		expect(combinePeaks([], 10, 2)).toEqual([0, 0]);
		expect(combinePeaks([{ peaks: [1], duration: 1 }], 0, 2)).toEqual([0, 0]);
	});
});
