import { describe, expect, it } from "vite-plus/test";
import { sliceLanes } from "./sliceLanes";

describe("sliceLanes", () => {
	const lanes = [
		{
			kind: "cc" as const,
			controller: 64,
			points: [
				{ t: 1, v: 1 },
				{ t: 3, v: 0 },
				{ t: 5, v: 1 },
			],
		},
		{ kind: "bend" as const, points: [{ t: 0.5, v: 0.7 }] },
	];
	it("re-times the points inside the piece and states the value in force at its start", () => {
		expect(sliceLanes(lanes, 2, 4)).toEqual([
			{
				kind: "cc",
				controller: 64,
				points: [
					{ t: 0, v: 1 },
					{ t: 1, v: 0 },
				],
			},
			{ kind: "bend", points: [{ t: 0, v: 0.7 }] },
		]);
	});
	it("leaves out a lane with nothing but its default in the piece", () => {
		expect(sliceLanes(lanes, 3.5, 4.5)).toEqual([{ kind: "bend", points: [{ t: 0, v: 0.7 }] }]);
	});
});
