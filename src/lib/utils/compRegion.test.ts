import type { StudioClip } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { compRegion } from "./compRegion";

const clip: StudioClip = {
	id: "c",
	trackId: "t",
	sourceId: "s1",
	alternates: ["s2", "s3"],
	start: 10,
	offset: 1,
	duration: 8,
	gain: 0.8,
	fadeIn: 0.2,
	fadeOut: 0.3,
	name: "Riff",
};

describe("compRegion", () => {
	it("splits the clip into three: the middle from the take, overlapping its neighbors by the crossfade", () => {
		const out = compRegion(clip, "s2", 12, 14, 0.05)!;
		expect(out.map((p) => [p.sourceId, p.start, p.duration, p.offset])).toEqual([
			["s1", 10, 2.05, 1],
			["s2", 11.95, 2.1, 2.95],
			["s1", 13.95, 4.05, 4.95],
		]);
		expect(out[0]!.alternates).toEqual(["s2", "s3"]);
		expect(out[1]!.alternates).toEqual(["s1", "s3"]);
		expect(out[0]!.fadeIn).toBe(0.2);
		expect(out[2]!.fadeOut).toBe(0.3);
		expect(out[1]!.fadeIn).toBe(0);
		expect(out.every((p) => p.gain === 0.8 && p.name === "Riff" && p.trackId === "t")).toBe(true);
	});
	it("a region at the clip's start or end makes two pieces", () => {
		const head = compRegion(clip, "s3", 9, 12, 0.05)!;
		expect(head.map((p) => [p.sourceId, p.start, p.duration])).toEqual([
			["s3", 10, 2.05],
			["s1", 11.95, 6.05],
		]);
		const tail = compRegion(clip, "s3", 16, 30, 0.05)!;
		expect(tail.map((p) => [p.sourceId, p.start, p.duration])).toEqual([
			["s1", 10, 6.05],
			["s3", 15.95, 2.05],
		]);
	});
	it("the whole clip from a take is one piece", () => {
		const out = compRegion(clip, "s2", 0, 100)!;
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ sourceId: "s2", start: 10, duration: 8, offset: 1 });
	});
	it("refuses a take the clip does not hold, a MIDI clip, or a region off the clip", () => {
		expect(compRegion(clip, "zzz", 12, 14)).toBeNull();
		expect(compRegion({ ...clip, sourceId: undefined, notes: [] }, "s2", 12, 14)).toBeNull();
		expect(compRegion(clip, "s2", 30, 40)).toBeNull();
		expect(compRegion(clip, "s2", 12, 12.001)).toBeNull();
	});
});
