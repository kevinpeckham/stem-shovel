import { describe, expect, it } from "vite-plus/test";
import { splitClipAt } from "./splitClipAt";

const clip = { id: "c", start: 2, offset: 1, duration: 4, fadeIn: 0.5, fadeOut: 0.5, gain: 0.8 };

describe("splitClipAt", () => {
	it("cuts into a left part and a right part that together cover the clip", () => {
		const r = splitClipAt(clip, 3);
		expect(r?.left).toMatchObject({ start: 2, offset: 1, duration: 1, gain: 0.8 });
		expect(r?.right).toMatchObject({ start: 3, offset: 2, duration: 3, gain: 0.8 });
	});
	it("keeps the fade-in on the left and the fade-out on the right", () => {
		const r = splitClipAt(clip, 4);
		expect(r?.left).toMatchObject({ fadeIn: 0.5, fadeOut: 0 });
		expect(r?.right).toMatchObject({ fadeIn: 0, fadeOut: 0.5 });
	});
	it("shrinks a fade that no longer fits its part", () => {
		const r = splitClipAt(clip, 2.4);
		expect(r?.left.fadeIn).toBe(0.2);
	});
	it("refuses a cut at or within 10 ms of an end", () => {
		expect(splitClipAt(clip, 2)).toBeNull();
		expect(splitClipAt(clip, 2.005)).toBeNull();
		expect(splitClipAt(clip, 6)).toBeNull();
		expect(splitClipAt(clip, 1)).toBeNull();
	});
	it("leaves the clip it was given untouched", () => {
		splitClipAt(clip, 3);
		expect(clip.duration).toBe(4);
	});
});
