import { describe, expect, it } from "vite-plus/test";
import { fakeAudioBuffer, fakeContext } from "../../../tests/helpers/fakeAudioBuffer";
import { sliceBuffer } from "./sliceBuffer";

describe("sliceBuffer", () => {
	it("copies the seconds asked for from every channel", () => {
		const sr = 10;
		const left = Float32Array.from({ length: 30 }, (_, i) => i);
		const right = Float32Array.from({ length: 30 }, (_, i) => -i);
		const out = sliceBuffer(fakeContext(), fakeAudioBuffer([left, right], sr), 1, 2.5);
		expect(out.sampleRate).toBe(sr);
		expect(out.length).toBe(15);
		expect(Array.from(out.getChannelData(0)).slice(0, 3)).toEqual([10, 11, 12]);
		expect(Array.from(out.getChannelData(1)).slice(-1)).toEqual([-24]);
	});
	it("clamps to the buffer and never returns an empty buffer", () => {
		const out = sliceBuffer(fakeContext(), fakeAudioBuffer([new Float32Array(10)], 10), 0.8, 5);
		expect(out.length).toBe(2);
		expect(
			sliceBuffer(fakeContext(), fakeAudioBuffer([new Float32Array(10)], 10), 3, 4).length,
		).toBe(1);
	});
});
