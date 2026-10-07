import { describe, expect, it } from "vite-plus/test";
import { trimmedClip } from "./trimmedClip";

const clip = { start: 2, offset: 1, duration: 4, fadeIn: 0, fadeOut: 0 };

describe("trimmedClip", () => {
	it("moves the left edge with its offset", () => {
		expect(trimmedClip(clip, { start: 3 }, 10)).toEqual({
			start: 3,
			offset: 2,
			duration: 3,
			fadeIn: 0,
			fadeOut: 0,
		});
	});
	it("opens the left edge no earlier than the source's start", () => {
		// The clip began 1 s into its source, so it can open 1 s earlier and no more.
		expect(trimmedClip(clip, { start: 0 }, 10)).toEqual({
			start: 1,
			offset: 0,
			duration: 5,
			fadeIn: 0,
			fadeOut: 0,
		});
	});
	it("sets the right edge, no later than the source's end", () => {
		expect(trimmedClip(clip, { end: 4 }, 10)?.duration).toBe(2);
		// Source 10 s long from offset 1 leaves 9 s at most.
		expect(trimmedClip(clip, { end: 30 }, 10)?.duration).toBe(9);
	});
	it("keeps at least ten milliseconds", () => {
		expect(trimmedClip(clip, { end: 1 }, 10)?.duration).toBe(0.01);
		expect(trimmedClip(clip, { start: 9 }, 10)?.start).toBe(5.99);
	});
	it("returns null when nothing changes", () => {
		expect(trimmedClip(clip, { start: 2 }, 10)).toBeNull();
		expect(trimmedClip(clip, {}, 10)).toBeNull();
	});
	it("shrinks fades to fit a short clip", () => {
		const faded = { ...clip, fadeIn: 1, fadeOut: 1 };
		expect(trimmedClip(faded, { end: 3 }, 10)).toMatchObject({
			duration: 1,
			fadeIn: 0.5,
			fadeOut: 0.5,
		});
	});
	it("rounds to a tenth of a millisecond", () => {
		expect(trimmedClip(clip, { start: 2.123456 }, 10)?.start).toBe(2.1235);
	});
});
