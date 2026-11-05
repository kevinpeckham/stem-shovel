import { describe, expect, it } from "vite-plus/test";
import { rollNoteSpan } from "./rollNoteSpan.js";

describe("rollNoteSpan", () => {
	it("places a note at the file's time over the song's width", () => {
		expect(rollNoteSpan({ start: 10, duration: 5 }, 0, 100, 1000)).toEqual({ x: 100, width: 50 });
	});
	it("shifts every note by the song's start offset, so bar 1 of the file lands on the song's first downbeat", () => {
		expect(rollNoteSpan({ start: 0, duration: 2 }, 3.5, 100, 1000)).toEqual({ x: 35, width: 20 });
		expect(rollNoteSpan({ start: 10, duration: 5 }, 3.5, 100, 1000)).toEqual({ x: 135, width: 50 });
	});
	it("is at least a pixel wide, and nothing without a song length", () => {
		expect(rollNoteSpan({ start: 10, duration: 0.001 }, 0, 100, 1000).width).toBe(1);
		expect(rollNoteSpan({ start: 10, duration: 5 }, 2, 0, 1000)).toEqual({ x: 0, width: 1 });
	});
});
