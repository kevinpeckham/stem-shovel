import { barAt, secondsAtBar, tempoAt } from "#lib/audio/measures.js";
import { describe, expect, it } from "vite-plus/test";
import { studioGrid } from "./studioGrid";

describe("studioGrid", () => {
	it("is the song's tempo and meter from zero without changes", () => {
		const g = studioGrid({ bpm: 120, beatsPerBar: 4 });
		expect(g).toEqual({
			tempos: [{ start: 0, bpm: 120 }],
			meters: [{ start: 0, beatsPerBar: 4 }],
			startAt: 0,
		});
		expect(barAt(g, 5)).toEqual({ bar: 3, beat: 3, fraction: 0 });
	});
	it("takes the changes in order of time, a change at zero dropped for the song's own", () => {
		const g = studioGrid({
			bpm: 120,
			beatsPerBar: 4,
			tempoChanges: [
				{ start: 8, bpm: 60 },
				{ start: 4, bpm: 240 },
				{ start: 0, bpm: 99 },
			],
			meterChanges: [{ start: 4, beatsPerBar: 3 }],
		});
		expect(g.tempos.map((t) => [t.start, t.bpm])).toEqual([
			[0, 120],
			[4, 240],
			[8, 60],
		]);
		expect(tempoAt(g, 5)).toBe(240);
		expect(tempoAt(g, 9)).toBe(60);
		// Bars 1 and 2 at 120 in 4/4 end at 4 s; from there 3/4 at 240 bpm: a bar is 0.75 s.
		expect(secondsAtBar(g, 3)).toBe(4);
		expect(secondsAtBar(g, 4)).toBeCloseTo(4.75, 6);
	});
});
