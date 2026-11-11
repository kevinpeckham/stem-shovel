import { describe, expect, test } from "vite-plus/test";
import { beatThisChunks } from "./beatThisChunks";
import { beatThisStitch } from "./beatThisStitch";

describe("beatThisStitch", () => {
	test("the first chunk keeps the overlap, borders dropped", () => {
		// chunk 10, border 2: each chunk's frames 2..7 land at start + 2 .. start + 7.
		const a = new Float32Array(10).fill(1);
		const b = new Float32Array(10).fill(2);
		a[0] = a[1] = a[8] = a[9] = 9; // borders, never written
		const out = beatThisStitch([a, b], [-2, 2], 12, 10, 2);
		// a covers 0..5, b covers 4..9; 4 and 5 stay a's; 10 and 11 untouched.
		expect(Array.from(out)).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 2, -1000, -1000]);
	});
	test("a short piece round-trips through one padded chunk", () => {
		const frames = 100;
		const starts = beatThisChunks(frames);
		expect(starts).toEqual([-6]);
		// The model's logits for chunk row r are frame r − 6 of the piece (or junk past it).
		const logits = Float32Array.from({ length: 1500 }, (_, r) => r - 6);
		const out = beatThisStitch([logits], starts, frames);
		expect(Array.from(out)).toEqual(Array.from({ length: frames }, (_, i) => i));
	});
	test("a long piece: every frame comes from the earliest chunk covering it", () => {
		const frames = 3000;
		const starts = beatThisChunks(frames); // [−6, 1482, 1506]
		const chunks = starts.map((s, c) =>
			Float32Array.from({ length: 1500 }, (_, r) => c * 10000 + s + r),
		);
		const out = beatThisStitch(chunks, starts, frames);
		// Value − c·10000 is the frame itself; c is 0 to 1487, 1 to 2975, 2 after.
		for (let f = 0; f < frames; f++) {
			const c = f < 1488 ? 0 : f < 2976 ? 1 : 2;
			expect(out[f]).toBe(c * 10000 + f);
		}
	});
});
