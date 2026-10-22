import { describe, expect, it } from "vite-plus/test";
import { clipContentTime, clipSegments } from "./clipSegments";

describe("clipSegments", () => {
	it("is one pass for a clip without a loop", () => {
		expect(clipSegments({ start: 2, offset: 0.5, duration: 3 })).toEqual([
			{ start: 2, offset: 0.5, duration: 3 },
		]);
	});
	it("plays to the loop's end, then the loop again and again, the last pass cut to the clip's length", () => {
		const clip = { start: 10, offset: 1, duration: 7, loop: { start: 2, end: 4 } };
		expect(clipSegments(clip)).toEqual([
			{ start: 10, offset: 1, duration: 3 },
			{ start: 13, offset: 2, duration: 2 },
			{ start: 15, offset: 2, duration: 2 },
		]);
		expect(clipContentTime(clip, 0)).toBe(1);
		expect(clipContentTime(clip, 2.5)).toBe(3.5);
		expect(clipContentTime(clip, 3)).toBe(2);
		expect(clipContentTime(clip, 6.5)).toBe(3.5);
		expect(clipContentTime(clip, 7)).toBe(4);
	});
	it("starts inside the loop when the offset is past its end", () => {
		expect(
			clipSegments({ start: 0, offset: 5, duration: 1.5, loop: { start: 0, end: 1 } }),
		).toEqual([
			{ start: 0, offset: 0, duration: 1 },
			{ start: 1, offset: 0, duration: 0.5 },
		]);
	});
	it("ignores a loop with no length", () => {
		expect(clipSegments({ start: 0, offset: 0, duration: 2, loop: { start: 1, end: 1 } })).toEqual([
			{ start: 0, offset: 0, duration: 2 },
		]);
		expect(clipContentTime({ start: 0, offset: 0.25, duration: 2 }, 1)).toBe(1.25);
	});
});
