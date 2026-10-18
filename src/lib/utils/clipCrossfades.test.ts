import { describe, expect, it } from "vite-plus/test";
import { clipCrossfades } from "./clipCrossfades";

const clip = (id: string, start: number, duration: number, over: Record<string, unknown> = {}) => ({
	id,
	trackId: "t",
	start,
	duration,
	fadeIn: 0,
	fadeOut: 0,
	...over,
});

describe("clipCrossfades", () => {
	it("leaves clips that do not touch with their own fades and shapes", () => {
		const m = clipCrossfades([
			clip("a", 0, 2, { fadeIn: 0.1, fadeShape: "power" }),
			clip("b", 2, 2, { fadeOut: 0.3 }),
		]);
		expect(m.get("a")).toEqual({ fadeIn: 0.1, fadeOut: 0, inShape: "power", outShape: "power" });
		expect(m.get("b")).toEqual({ fadeIn: 0, fadeOut: 0.3, inShape: "linear", outShape: "linear" });
	});
	it("crossfades an overlap equal power: the first fades out over it, the second fades in", () => {
		const m = clipCrossfades([clip("a", 0, 4), clip("b", 3.5, 4)]);
		expect(m.get("a")).toEqual({ fadeIn: 0, fadeOut: 0.5, inShape: "linear", outShape: "power" });
		expect(m.get("b")).toEqual({ fadeIn: 0.5, fadeOut: 0, inShape: "power", outShape: "linear" });
	});
	it("keeps a longer fade of the clip's own, and caps the overlap at half a clip", () => {
		const m = clipCrossfades([clip("a", 0, 4, { fadeOut: 1 }), clip("b", 3.5, 0.6)]);
		expect(m.get("a")!.fadeOut).toBe(1);
		expect(m.get("a")!.outShape).toBe("linear");
		// b is 0.6 s long: the crossfade into it is at most 0.3.
		expect(m.get("b")!.fadeIn).toBe(0.3);
	});
	it("only looks within a track", () => {
		const m = clipCrossfades([clip("a", 0, 4), { ...clip("b", 3, 4), trackId: "other" }]);
		expect(m.get("a")!.fadeOut).toBe(0);
		expect(m.get("b")!.fadeIn).toBe(0);
	});
});
