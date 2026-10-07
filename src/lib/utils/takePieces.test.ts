import { describe, expect, it } from "vite-plus/test";
import { takePieces } from "./takePieces";

describe("takePieces", () => {
	it("lands a plain take whole, where recording began", () => {
		expect(takePieces({ from: 3, duration: 4, loop: null, punch: false })).toEqual([
			{ from: 0, to: 4, start: 3 },
		]);
	});
	it("ignores a loop that is off and punch that is off", () => {
		expect(
			takePieces({ from: 1, duration: 5, loop: { on: false, start: 0, end: 2 }, punch: false }),
		).toEqual([{ from: 0, to: 5, start: 1 }]);
	});
	it("looping from the region's start, makes a piece per full pass and drops the remainder", () => {
		const loop = { on: true, start: 0, end: 2 };
		expect(takePieces({ from: 0, duration: 5.3, loop, punch: false })).toEqual([
			{ from: 0, to: 2, start: 0 },
			{ from: 2, to: 4, start: 0 },
		]);
	});
	it("looping from before the region, the first piece begins at the region's start", () => {
		const loop = { on: true, start: 4, end: 6 };
		// Play-in from 3: the take's first second is the run-up, then passes [4,6) and [4,6).
		expect(takePieces({ from: 3, duration: 5, loop, punch: false })).toEqual([
			{ from: 1, to: 3, start: 4 },
			{ from: 3, to: 5, start: 4 },
		]);
	});
	it("looping from inside the region, the partial first pass is skipped", () => {
		const loop = { on: true, start: 0, end: 2 };
		// From 1: the first pass only has [1,2); the full passes start at take second 1.
		expect(takePieces({ from: 1, duration: 5, loop, punch: false })).toEqual([
			{ from: 1, to: 3, start: 0 },
			{ from: 3, to: 5, start: 0 },
		]);
	});
	it("looping with no full pass lands the take whole", () => {
		const loop = { on: true, start: 0, end: 4 };
		expect(takePieces({ from: 0, duration: 3, loop, punch: false })).toEqual([
			{ from: 0, to: 3, start: 0 },
		]);
	});
	it("looping with recording begun after the region is a plain take", () => {
		const loop = { on: true, start: 0, end: 2 };
		expect(takePieces({ from: 5, duration: 3, loop, punch: false })).toEqual([
			{ from: 0, to: 3, start: 5 },
		]);
	});
	it("punch keeps the region alone", () => {
		const loop = { on: false, start: 2, end: 4 };
		expect(takePieces({ from: 0.5, duration: 5, loop, punch: true })).toEqual([
			{ from: 1.5, to: 3.5, start: 2 },
		]);
	});
	it("punch with a take that ends inside the region keeps what it has", () => {
		const loop = { on: false, start: 2, end: 4 };
		expect(takePieces({ from: 1, duration: 2, loop, punch: true })).toEqual([
			{ from: 1, to: 2, start: 2 },
		]);
	});
	it("punch with nothing in the region lands nothing", () => {
		const loop = { on: false, start: 2, end: 4 };
		expect(takePieces({ from: 0, duration: 1.5, loop, punch: true })).toEqual([]);
		expect(takePieces({ from: 5, duration: 2, loop, punch: true })).toEqual([
			{ from: 0, to: 2, start: 5 },
		]);
	});
	it("tolerates a take a few milliseconds short of the pass", () => {
		const loop = { on: true, start: 0, end: 2 };
		expect(takePieces({ from: 0, duration: 3.997, loop, punch: false })).toHaveLength(2);
	});
});
