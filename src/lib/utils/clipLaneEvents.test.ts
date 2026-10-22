import { describe, expect, it } from "vite-plus/test";
import { clipLaneEvents } from "./clipLaneEvents";

describe("clipLaneEvents", () => {
	const clip = {
		start: 10,
		offset: 1,
		duration: 4,
		lanes: [
			{
				kind: "cc" as const,
				controller: 64,
				points: [
					{ t: 0.5, v: 1 }, // before the offset: in force as the clip starts
					{ t: 2, v: 0 },
					{ t: 6, v: 1 }, // past the end: never
				],
			},
			{ kind: "bend" as const, points: [{ t: 3, v: 0.75 }] },
		],
	};
	it("states each lane's value as the clip starts, its points inside, and the default at the end", () => {
		expect(clipLaneEvents(clip)).toEqual([
			{ at: 10, kind: "cc", controller: 64, value: 1 },
			{ at: 10, kind: "bend", value: 0.5 },
			{ at: 11, kind: "cc", controller: 64, value: 0 },
			{ at: 12, kind: "bend", value: 0.75 },
			{ at: 14, kind: "cc", controller: 64, value: 0 },
			{ at: 14, kind: "bend", value: 0.5 },
		]);
	});
	it("takes a window", () => {
		expect(clipLaneEvents(clip, 10.5, 12.5).map((e) => [e.at, e.kind])).toEqual([
			[11, "cc"],
			[12, "bend"],
		]);
	});
	it("restates the lanes at every pass of a looped clip", () => {
		const looped = { ...clip, loop: { start: 1, end: 3 } };
		expect(clipLaneEvents(looped).map((e) => [e.at, e.kind, e.value])).toEqual([
			[10, "cc", 1],
			[10, "bend", 0.5],
			[11, "cc", 0],
			[12, "cc", 1],
			[12, "bend", 0.5],
			[13, "cc", 0],
			[14, "cc", 0],
			[14, "bend", 0.5],
		]);
	});
	it("is empty without lanes", () => {
		expect(clipLaneEvents({ start: 0, offset: 0, duration: 1 })).toEqual([]);
		expect(
			clipLaneEvents({ start: 0, offset: 0, duration: 1, lanes: [{ kind: "bend", points: [] }] }),
		).toEqual([]);
	});
});
