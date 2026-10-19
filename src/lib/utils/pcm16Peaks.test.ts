import { describe, expect, test } from "vite-plus/test";
import { createPcm16Peaks, reducePeaks } from "./pcm16Peaks";

/** Little-endian 16-bit words as bytes. */
const bytes = (words: number[]) => {
	const out = new Uint8Array(words.length * 2);
	for (const [i, w] of words.entries()) {
		const u = w < 0 ? w + 0x10000 : w;
		out[i * 2] = u & 0xff;
		out[i * 2 + 1] = u >> 8;
	}
	return out;
};

describe("createPcm16Peaks", () => {
	test("folds samples into frames and the frames into bins, in 0..1", () => {
		const p = createPcm16Peaks(2);
		p.push(bytes([0, 16384, -32768, 100, 0, 0, 8192, 0]));
		const { peaks, samples } = p.finish(4);
		expect(samples).toBe(8);
		expect(peaks).toEqual([0.5, 1, 0, 0.25]);
	});
	test("a byte left over from an odd chunk carries into the next", () => {
		const whole = bytes([0, 32767, 0, 0]);
		const p = createPcm16Peaks(1);
		p.push(whole.subarray(0, 3));
		p.push(whole.subarray(3));
		const { peaks, samples } = p.finish(4);
		expect(samples).toBe(4);
		expect(peaks[1]).toBeCloseTo(32767 / 32768, 5);
		expect(peaks[0]).toBe(0);
	});
	test("a last frame short of its length still counts", () => {
		const p = createPcm16Peaks(4);
		p.push(bytes([0, 0, 0, 0, 0, 16384]));
		const { peaks, samples } = p.finish(2);
		expect(samples).toBe(6);
		expect(peaks).toEqual([0, 0.5]);
	});
	test("nothing pushed is silence", () => {
		expect(createPcm16Peaks().finish(3)).toEqual({ peaks: [0, 0, 0], samples: 0 });
	});
});

describe("reducePeaks", () => {
	test("takes the loudest of each bin's share and stretches a short run", () => {
		expect(reducePeaks([0.1, 0.9, 0.2, 0.3, 0.8, 0.1], 3)).toEqual([0.9, 0.3, 0.8]);
		expect(reducePeaks([0.4, 0.6], 4)).toEqual([0.4, 0.4, 0.6, 0.6]);
		expect(reducePeaks([1.5], 1)).toEqual([1]);
	});
});
