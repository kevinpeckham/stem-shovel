import { describe, expect, it } from "vite-plus/test";
import {
	beatsFromHold,
	measuresOf,
	nextBeats,
	restBeatsFromGap,
	type ProgressionEntry,
} from "./chordRhythm";

const chord = (beats: 1 | 2 | 4): ProgressionEntry => ({
	kind: "chord",
	label: "C",
	wedge: "C",
	notes: [60, 64, 67],
	beats,
});
const rest = (beats: 1 | 2 | 4): ProgressionEntry => ({ kind: "rest", beats });

describe("chordRhythm", () => {
	it("quantizes a hold to one, two or four beats at the tempo", () => {
		// 120 bpm: a beat is 500 ms.
		expect(beatsFromHold(100, 120)).toBe(1);
		expect(beatsFromHold(700, 120)).toBe(1);
		expect(beatsFromHold(800, 120)).toBe(2);
		expect(beatsFromHold(1400, 120)).toBe(2);
		expect(beatsFromHold(1500, 120)).toBe(4);
		expect(beatsFromHold(9000, 120)).toBe(4);
	});
	it("reads a gap as articulation, a rest, or thinking time", () => {
		expect(restBeatsFromGap(200, 120)).toBe(0);
		expect(restBeatsFromGap(600, 120)).toBe(1);
		expect(restBeatsFromGap(1000, 120)).toBe(2);
		expect(restBeatsFromGap(3000, 120)).toBe(4);
		expect(restBeatsFromGap(4001, 120)).toBe(0);
	});
	it("groups entries into measures, a straddling entry starting the next bar", () => {
		const m = measuresOf([chord(2), chord(1), chord(2), rest(1), chord(4)], 4);
		expect(m.map((bar) => bar.map((e) => e.beats))).toEqual([[2, 1], [2, 1], [4]]);
	});
	it("fills a bar exactly and starts a new one", () => {
		const m = measuresOf([chord(1), chord(1), chord(1), chord(1), chord(1)], 4);
		expect(m.length).toBe(2);
		expect(m[1].length).toBe(1);
	});
	it("cycles an entry's length", () => {
		expect(nextBeats(1)).toBe(2);
		expect(nextBeats(2)).toBe(4);
		expect(nextBeats(4)).toBe(1);
	});
});
