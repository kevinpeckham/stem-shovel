import { describe, expect, it } from "vite-plus/test";
import { snapToGrid } from "./snapToGrid";

describe("snapToGrid", () => {
	it("rounds to the nearest beat at the tempo", () => {
		expect(snapToGrid(1.2, { on: true, bpm: 120 })).toBe(1);
		expect(snapToGrid(1.3, { on: true, bpm: 120 })).toBe(1.5);
		expect(snapToGrid(0.74, { on: true, bpm: 60 })).toBe(1);
	});
	it("never snaps before zero", () => {
		expect(snapToGrid(-0.4, { on: true, bpm: 120 })).toBe(0);
		expect(snapToGrid(-3, { on: false, bpm: 120 })).toBe(0);
	});
	it("leaves the time alone in free time", () => {
		expect(snapToGrid(1.234, { on: false, bpm: 120 })).toBe(1.234);
	});
});
