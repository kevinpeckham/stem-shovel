import { describe, expect, it } from "vite-plus/test";
import type { ClipNoteEvent } from "./clipNoteEvents";
import { studioGrid } from "./studioGrid";
import { swingNotes } from "./swingNotes";

const note = (at: number, velocity = 0.8): ClipNoteEvent => ({
	at,
	duration: 0.2,
	pitch: 60,
	velocity,
});

describe("swingNotes", () => {
	const grid = studioGrid({ bpm: 120, beatsPerBar: 4 });
	it("is the notes themselves with nothing on", () => {
		const list = [note(0), note(0.25)];
		expect(swingNotes(list, { grid })).toBe(list);
	});
	it("delays the off-beat eighths toward a triplet feel and leaves the on-beats", () => {
		// A beat is 0.5 s: the "and" at 0.25 moves to 0.25 + 0.0833 at full swing, half that at 0.5.
		const out = swingNotes([note(0), note(0.25), note(0.5), note(0.75), note(0.26)], {
			grid,
			swing: 1,
		});
		expect(out.map((e) => +e.at.toFixed(4))).toEqual([0, 0.3333, 0.3333, 0.5, 0.8333]);
		const half = swingNotes([note(0.25)], { grid, swing: 0.5 });
		expect(half[0]!.at).toBeCloseTo(0.2917, 4);
		// A note well off the eighth (a sixteenth) is not an "and" and stays.
		expect(swingNotes([note(0.125)], { grid, swing: 1 })[0]!.at).toBe(0.125);
	});
	it("humanizes time and velocity from the random source, within its bounds", () => {
		const out = swingNotes([note(1, 0.5)], { grid, humanize: 1, random: () => 1 });
		expect(out[0]!.at).toBeCloseTo(1.03, 6);
		expect(out[0]!.velocity).toBeCloseTo(0.7, 6);
		const low = swingNotes([note(0.01, 0.1)], { grid, humanize: 1, random: () => 0 });
		expect(low[0]!.at).toBe(0);
		expect(low[0]!.velocity).toBe(0.05);
	});
});
