import { describe, expect, test } from "vite-plus/test";
import { beatThisChunks } from "./beatThisChunks";

describe("beatThisChunks", () => {
	// step = 1500 − 2·6 = 1488; arange(−6, len − 6, 1488); then, when
	// len > 1488, the last start becomes len − 1494.
	test("100 frames: arange(−6, 94, 1488) = [−6], too short to move", () => {
		expect(beatThisChunks(100)).toEqual([-6]);
	});
	test("1488 frames: arange(−6, 1482) = [−6]; 1488 is not > 1488", () => {
		expect(beatThisChunks(1488)).toEqual([-6]);
	});
	test("1489 frames: arange(−6, 1483, 1488) = [−6, 1482], last → 1489 − 1494 = −5", () => {
		// Two chunks, the second moved back before the first: verbatim split_piece.
		expect(beatThisChunks(1489)).toEqual([-6, -5]);
	});
	test("1500 frames: arange(−6, 1494) = [−6, 1482], last → 1500 − 1494 = 6", () => {
		expect(beatThisChunks(1500)).toEqual([-6, 6]);
	});
	test("3000 frames: [−6, 1482, 2970], last → 3000 − 1494 = 1506", () => {
		expect(beatThisChunks(3000)).toEqual([-6, 1482, 1506]);
	});
	test("4000 frames: [−6, 1482, 2970], last → 4000 − 1494 = 2506", () => {
		expect(beatThisChunks(4000)).toEqual([-6, 1482, 2506]);
	});
	test("other sizes: 250-frame chunks over 600 frames", () => {
		// step 238: arange(−6, 594, 238) = [−6, 232, 470]; last → 600 − 244 = 356.
		expect(beatThisChunks(600, 250, 6)).toEqual([-6, 232, 356]);
	});
	test("no frames, no chunks", () => {
		expect(beatThisChunks(0)).toEqual([]);
	});
});
