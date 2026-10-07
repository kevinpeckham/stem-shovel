import { describe, expect, it } from "vite-plus/test";
import { fakeAudioBuffer } from "../../../tests/helpers/fakeAudioBuffer";
import { combinePeaks, computeMixPeaks, computePeaks } from "./peaks";

const round = (peaks: ArrayLike<number>) => Array.from(peaks, (p) => +p.toFixed(4));

describe("computePeaks", () => {
	it("keeps the loudest absolute sample per bin across the channels", () => {
		const left = new Float32Array([0.1, -0.9, 0.2, 0.3]);
		const right = new Float32Array([0.5, 0.1, -0.4, 0]);
		expect(round(computePeaks(fakeAudioBuffer([left, right]), 2))).toEqual([0.9, 0.4]);
		expect(round(computePeaks(fakeAudioBuffer([left]), 2))).toEqual([0.9, 0.3]);
	});
	it("leaves a bin at zero when there are more bins than samples", () => {
		const mono = fakeAudioBuffer([new Float32Array([0.5, 0.25, 1])]);
		expect(round(computePeaks(mono, 6))).toEqual([0, 0.5, 0, 0.25, 0, 1]);
	});
	it("defaults to 1024 bins", () => {
		expect(computePeaks(fakeAudioBuffer([new Float32Array(8)]))).toHaveLength(1024);
	});
});

describe("computeMixPeaks", () => {
	it("takes the peaks of the sum, normalised to the loudest bin", () => {
		const a = fakeAudioBuffer([new Float32Array([1, -1])]);
		const b = fakeAudioBuffer([new Float32Array([0.5, 0.5])]);
		expect(round(computeMixPeaks([a, b], 2))).toEqual([1, 0.3333]);
	});
	it("shows stems that cancel as silence and averages a stem's channels", () => {
		const up = fakeAudioBuffer([new Float32Array([1, 0])]);
		const down = fakeAudioBuffer([new Float32Array([-1, 0])]);
		expect(round(computeMixPeaks([up, down], 2))).toEqual([0, 0]);
		const stereo = fakeAudioBuffer([new Float32Array([1, 0]), new Float32Array([0, 0])]);
		const mono = fakeAudioBuffer([new Float32Array([0, 0.25])]);
		expect(round(computeMixPeaks([stereo, mono], 2))).toEqual([1, 0.5]);
	});
	it("spans the longest buffer and ignores a shorter one past its end", () => {
		const long = fakeAudioBuffer([new Float32Array([1, 1, 1, 1])]);
		const short = fakeAudioBuffer([new Float32Array([1])]);
		expect(round(computeMixPeaks([long, short], 2))).toEqual([1, 0.5]);
		expect(round(computeMixPeaks([], 3))).toEqual([0, 0, 0]);
	});
});

describe("combinePeaks", () => {
	it("combines stored peaks as the root of the sum of squares, normalised", () => {
		const stems = [
			{ peaks: [0.6, 0.3], duration: 2 },
			{ peaks: [0.8, 0], duration: 2 },
		];
		expect(round(combinePeaks(stems, 2, 2))).toEqual([1, 0.3]);
	});
	it("places a shorter stem on the song's length and skips one without peaks", () => {
		const stems = [
			{ peaks: [1], duration: 1 },
			{ peaks: [], duration: 2 },
		];
		expect(combinePeaks(stems, 2, 2)).toEqual([1, 0]);
		expect(combinePeaks(stems, 0, 2)).toEqual([0, 0]);
	});
});
