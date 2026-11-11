import { describe, expect, test } from "vite-plus/test";
import { beatThisChunkOf } from "./beatThisChunkOf";

/** A [frames][mels] spectrogram whose every value is its frame number + 1. */
function spectOf(frames: number, mels: number): Float32Array {
	return Float32Array.from({ length: frames * mels }, (_, i) => Math.floor(i / mels) + 1);
}

/** The frame number + 1 each chunk row carries, 0 for padding. */
function rowsOf(chunk: Float32Array, mels: number): number[] {
	return Array.from({ length: chunk.length / mels }, (_, r) => chunk[r * mels]);
}

describe("beatThisChunkOf", () => {
	test("a negative start pads zero rows on the left", () => {
		const out = beatThisChunkOf(spectOf(30, 2), 30, 2, -6, 20, 6);
		expect(out).toHaveLength(40);
		expect(rowsOf(out, 2)).toEqual([
			0,
			0,
			0,
			0,
			0,
			0,
			...Array.from({ length: 14 }, (_, i) => i + 1),
		]);
	});
	test("a short piece is zero on the right up to the full chunk", () => {
		const out = beatThisChunkOf(spectOf(5, 3), 5, 3, -6, 20, 6);
		expect(out).toHaveLength(60);
		expect(rowsOf(out, 3)).toEqual([0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, ...Array(9).fill(0)]);
	});
	test("an inner start copies rows straight", () => {
		const out = beatThisChunkOf(spectOf(50, 1), 50, 1, 10, 20, 6);
		expect(rowsOf(out, 1)).toEqual(Array.from({ length: 20 }, (_, i) => i + 11));
	});
});
