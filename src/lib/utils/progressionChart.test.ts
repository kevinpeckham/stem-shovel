import { parseChart } from "barmark";
import { describe, expect, it } from "vite-plus/test";
import type { ProgressionEntry } from "#lib/utils/chordRhythm.js";
import { progressionChart } from "./progressionChart";

const chord = (label: string, beats: 1 | 2 | 4): ProgressionEntry => ({
	kind: "chord",
	label,
	wedge: label,
	notes: [60],
	beats,
});
const rest = (beats: 1 | 2 | 4): ProgressionEntry => ({ kind: "rest", beats });
const opts = { bpm: 120, beatsPerBar: 4 };

/** The chord symbols (or null for a hold) of each parsed bar. */
function barsOf(text: string): (string | null)[][] {
	const parsed = parseChart(text);
	expect(parsed.diagnostics).toEqual([]);
	return parsed.bars.map((bar) =>
		bar.slots.map((s) =>
			s.kind === "chord" ? s.chord.canonical : s.kind === "nc" ? "N.C." : null,
		),
	);
}

describe("progressionChart", () => {
	it("lays out a mixed bar and a rest", () => {
		const text = progressionChart([chord("C", 2), chord("G", 1), chord("D", 1), rest(4)], {
			bpm: 92,
			beatsPerBar: 4,
			key: 1,
			name: "Verse idea",
		});
		expect(text).toBe("key: G, time: 4/4, tempo: 92\n\n## Verse idea\n\n| C / G D | N.C. |\n");
		expect(parseChart(text).bars).toHaveLength(2);
		expect(barsOf(text)[0]).toEqual(["C", null, "G", "D"]);
	});

	it("prints a whole-bar chord as one slot", () => {
		expect(progressionChart([chord("C", 4)], opts)).toContain("| C |");
	});

	it("carries a chord across a bar line as a hold", () => {
		const text = progressionChart([chord("C", 2), chord("G", 4), chord("D", 2)], opts);
		expect(text).toContain("| C G | / D |");
		expect(barsOf(text)).toEqual([
			["C", "G"],
			[null, "D"],
		]);
	});

	it("fills a short final bar with holds", () => {
		const text = progressionChart([chord("C", 4), chord("F", 1)], opts);
		expect(text).toContain("| C | F |");
		expect(parseChart(text).bars).toHaveLength(2);
	});

	it("writes rests as N.C.", () => {
		const text = progressionChart([chord("C", 2), rest(2)], opts);
		expect(text).toContain("| C N.C. |");
		expect(barsOf(text)).toEqual([["C", "N.C."]]);
	});

	it("names the key, meter, tempo and swing feel", () => {
		const head = (o: Parameters<typeof progressionChart>[1]) =>
			progressionChart([chord("C", 1)], o).split("\n")[0];
		expect(head({ bpm: 91.6, beatsPerBar: 3, key: 9 })).toBe("key: Eb, time: 3/4, tempo: 92");
		expect(head({ ...opts, key: 6 })).toBe("key: Gb, time: 4/4, tempo: 120");
		expect(head({ ...opts, swing: 0.6 })).toBe("time: 4/4, tempo: 120, feel: swing 60%");
		expect(head({ ...opts, swing: 0.5 })).toBe("time: 4/4, tempo: 120, feel: swing 58.3%");
		expect(head({ ...opts, swing: 0.2 })).toBe("time: 4/4, tempo: 120, feel: swing 53.3%");
		expect(head({ ...opts, swing: 1 })).toBe("time: 4/4, tempo: 120, feel: swing");
		expect(head({ ...opts, swing: 0 })).not.toContain("feel");
		expect(head(opts)).not.toContain("feel");
		expect(head({ ...opts, key: null })).not.toContain("key:");
	});

	it("heads the section with the name, Progression by default", () => {
		expect(progressionChart([chord("C", 4)], { ...opts, name: "  Bridge " })).toContain(
			"\n## Bridge\n",
		);
		expect(progressionChart([chord("C", 4)], opts)).toContain("\n## Progression\n");
		expect(progressionChart([chord("C", 4)], { ...opts, name: " " })).toContain(
			"\n## Progression\n",
		);
	});

	it("reads back every chord the player names", () => {
		const labels = [
			"Cmaj7",
			"Bm7♭5",
			"F♯5",
			"C°",
			"C°7",
			"G6/9",
			"E7♭9",
			"D+",
			"Aadd9",
			"Am(add9)",
			"Dsus4",
			"Asus2",
			"C6",
			"C9",
			"C11",
			"C13",
			"Cmaj9",
			"Cmaj13",
			"G7sus4",
		];
		const text = progressionChart(
			labels.map((l) => chord(l, 4)),
			opts,
		);
		const bars = barsOf(text);
		expect(bars).toHaveLength(labels.length);
		for (const bar of bars) expect(bar[0]).not.toBeNull();
	});

	it("gives directives alone for an empty pad", () => {
		const text = progressionChart([], { ...opts, key: 0 });
		expect(text).toBe("key: C, time: 4/4, tempo: 120\n");
		expect(parseChart(text).diagnostics).toEqual([]);
		expect(parseChart(text).bars).toHaveLength(0);
	});
});
