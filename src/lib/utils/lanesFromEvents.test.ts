import { describe, expect, it } from "vite-plus/test";
import { lanesFromEvents } from "./lanesFromEvents";

describe("lanesFromEvents", () => {
	it("gathers one lane per controller, bend and pressure, timed from the origin, repeats dropped", () => {
		const lanes = lanesFromEvents(
			[
				{ at: 12, kind: "cc", controller: 64, value: 1 },
				{ at: 13, kind: "cc", controller: 64, value: 1 },
				{ at: 14, kind: "cc", controller: 64, value: 0 },
				{ at: 11, kind: "bend", value: 0.5 },
				{ at: 12.5, kind: "bend", value: 0.9 },
				{ at: 15, kind: "pressure", value: 0.3 },
				{ at: 16, kind: "cc", controller: 1, value: 0.2 }, // at the end: out
			],
			10,
			16,
		);
		// Lanes in the order their first change came.
		expect(lanes).toEqual([
			{ kind: "bend", points: [{ t: 2.5, v: 0.9 }] },
			{
				kind: "cc",
				controller: 64,
				points: [
					{ t: 2, v: 1 },
					{ t: 4, v: 0 },
				],
			},
			{ kind: "pressure", points: [{ t: 5, v: 0.3 }] },
		]);
	});
	it("turns a change before the origin into the lane's value at zero", () => {
		expect(
			lanesFromEvents(
				[
					{ at: 9, kind: "cc", controller: 64, value: 1 },
					{ at: 12, kind: "cc", controller: 64, value: 0 },
				],
				10,
				20,
			),
		).toEqual([
			{
				kind: "cc",
				controller: 64,
				points: [
					{ t: 0, v: 1 },
					{ t: 2, v: 0 },
				],
			},
		]);
		expect(lanesFromEvents([{ at: 9, kind: "cc", controller: 64, value: 1 }], 10, 20)).toEqual([
			{ kind: "cc", controller: 64, points: [{ t: 0, v: 1 }] },
		]);
	});
	it("keeps the last of a run at one time and leaves out a lane that only says the default", () => {
		expect(
			lanesFromEvents(
				[
					{ at: 1, kind: "bend", value: 0.2 },
					{ at: 1, kind: "bend", value: 0.5 },
				],
				0,
				5,
			),
		).toEqual([]);
		expect(
			lanesFromEvents(
				[
					{ at: 1, kind: "cc", controller: 1, value: 0.1 },
					{ at: 1, kind: "cc", controller: 1, value: 0.4 },
				],
				0,
				5,
			),
		).toEqual([{ kind: "cc", controller: 1, points: [{ t: 1, v: 0.4 }] }]);
	});
	it("thins a lane past the point limit", () => {
		const events = Array.from({ length: 3000 }, (_, i) => ({
			at: i / 100,
			kind: "cc" as const,
			controller: 1,
			value: (i % 100) / 100,
		}));
		const [lane] = lanesFromEvents(events, 0, 100);
		expect(lane!.points).toHaveLength(1000);
		expect(lane!.points[0]).toEqual({ t: 0.01, v: 0.01 });
	});
});
