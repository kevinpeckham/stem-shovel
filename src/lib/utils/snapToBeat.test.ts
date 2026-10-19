import { describe, expect, it } from "vite-plus/test";
import { snapToBeat } from "./snapToBeat";
import { studioGrid } from "./studioGrid";

describe("snapToBeat", () => {
	const g = studioGrid({ bpm: 120, beatsPerBar: 4, tempoChanges: [{ start: 4, bpm: 60 }] });
	it("rounds to the nearest beat, through a tempo change", () => {
		expect(snapToBeat(g, 0.2)).toBe(0);
		expect(snapToBeat(g, 0.3)).toBe(0.5);
		expect(snapToBeat(g, 3.8)).toBe(4);
		// After 4 s a beat is a second long.
		expect(snapToBeat(g, 4.4)).toBe(4);
		expect(snapToBeat(g, 4.6)).toBe(5);
		expect(snapToBeat(g, -1)).toBe(0);
	});
	it("takes a division of the beat", () => {
		expect(snapToBeat(g, 0.3, 2)).toBe(0.25);
		expect(snapToBeat(g, 0.3, 4)).toBe(0.25);
		expect(snapToBeat(g, 0.32, 4)).toBe(0.375);
		expect(snapToBeat(g, 4.7, 2)).toBe(4.5);
	});
});
