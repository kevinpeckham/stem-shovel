import { describe, expect, it } from "vite-plus/test";
import { chartToProgression } from "./chartToProgression";
import { noteMidi, voiceChord } from "./chordNotes";
import { progressionChart } from "./progressionChart";
import type { ProgressionEntry } from "./chordRhythm";

const opts = { voicing: "standard" as const, octave: 4, bpm: 88 };
const chordsOf = (entries: ProgressionEntry[]) =>
	entries.map((e) => (e.kind === "chord" ? `${e.label}:${e.beats}` : `-:${e.beats}`));

describe("chartToProgression", () => {
	const probe =
		"key: G\ntime: 4/4\ntempo: 92\nfeel: swing\n\n## Verse\n| G / D/F# Em7 | N.C. | Cmaj7 | % |\n";

	it("reads the probe chart: beats, rests, labels, key, tempo and feel", () => {
		const r = chartToProgression(probe, opts);
		expect(r.errors).toEqual([]);
		expect(r.data.bpm).toBe(92);
		expect(r.data.beatsPerBar).toBe(4);
		expect(r.data.key).toBe(1);
		expect(r.feel).toBe("swing");
		expect(r.hasFeel).toBe(true);
		expect(r.name).toBe("Verse");
		expect(chordsOf(r.data.entries)).toEqual([
			"G:2",
			"D/F♯:1",
			"Em7:1",
			"-:4",
			"Cmaj7:4",
			"Cmaj7:4",
		]);
		const slash = r.data.entries[1];
		expect(slash.kind === "chord" && slash.notes[0]).toBe(noteMidi(6, 3));
		expect(slash.kind === "chord" && slash.wedge).toBe("D");
		const em = r.data.entries[2];
		expect(em.kind === "chord" && em.notes).toEqual([64, 67, 71, 74]);
		expect(em.kind === "chord" && em.wedge).toBe("Em");
		expect(r.warnings).toEqual([]);
	});

	it("takes the chart's tempo, else the caller's; no feel written leaves it unsaid", () => {
		const r = chartToProgression("| C |", opts);
		expect(r.data.bpm).toBe(88);
		expect(r.data.key).toBeUndefined();
		expect(r.hasFeel).toBe(false);
		expect(r.feel).toBe("straight");
		expect(r.name).toBe("Imported chart");
	});

	it("puts a minor key on its relative major and a diminished chord on its wedge", () => {
		const r = chartToProgression("key: Em\n\n| Em | F#dim |", opts);
		expect(r.data.key).toBe(1);
		const dim = r.data.entries[1];
		expect(dim.kind === "chord" && dim.wedge).toBe("Fsdim");
		expect(chartToProgression("key: Cm\n\n| Cm |", opts).data.key).toBe(9);
	});

	it("reads 3/4 and 6/8", () => {
		const waltz = chartToProgression("time: 3/4\n\n| C / G | F |", opts);
		expect(waltz.data.beatsPerBar).toBe(3);
		expect(chordsOf(waltz.data.entries)).toEqual(["C:2", "G:1", "F:2", "F:1"]);
		const six = chartToProgression("time: 6/8\n\n| C | G D |", opts);
		expect(six.data.beatsPerBar).toBe(2);
		expect(chordsOf(six.data.entries)).toEqual(["C:2", "G:1", "D:1"]);
	});

	it("strikes a three-beat chord again, once warned", () => {
		const r = chartToProgression("| C / / G | C / / G |", opts);
		expect(chordsOf(r.data.entries)).toEqual(["C:2", "C:1", "G:1", "C:2", "C:1", "G:1"]);
		expect(r.warnings).toEqual(["a chord longer than 4 beats or of 3 beats is struck again"]);
	});

	it("keeps a hold after N.C. a rest, and rounds chords off the beat", () => {
		expect(chordsOf(chartToProgression("| N.C. / C / |", opts).data.entries)).toEqual([
			"-:2",
			"C:2",
		]);
		const r = chartToProgression("| C G_D / / |", opts);
		expect(chordsOf(r.data.entries)).toEqual(["C:1", "G:1", "D:2"]);
		expect(r.warnings).toContain("some chords were not on the beat and were rounded");
	});

	it("keeps the first bar's meter, tempo and key, and says so", () => {
		const r = chartToProgression(
			"key: C\ntempo: 90\n\n| C |\n\ntime: 3/4\ntempo: 120\nkey: D\n\n| D G A |",
			opts,
		);
		expect(r.data.beatsPerBar).toBe(4);
		expect(r.data.bpm).toBe(90);
		expect(r.data.key).toBe(0);
		expect(r.warnings).toEqual([
			"the meter changes; the pad keeps the first bar's",
			"the tempo changes; the pad keeps the first",
			"the key changes; the circle stays in the first",
		]);
	});

	it("refuses a chart with errors or no bars", () => {
		expect(chartToProgression("| C | Q |", opts).errors[0]).toMatch(/^line 1: /);
		expect(chartToProgression("key: C", opts).errors).toEqual(["the chart has no bars"]);
	});

	it("round-trips the chart export", () => {
		const chord = (label: string, pitch: number, quality: "major" | "minor", beats: 1 | 2 | 4) =>
			({
				kind: "chord",
				label,
				wedge: "",
				notes: voiceChord({
					pitch,
					intervals: quality === "major" ? [0, 4, 7] : [0, 3, 7],
					voicing: "standard",
				}),
				beats,
			}) as const;
		const entries: ProgressionEntry[] = [
			chord("G", 7, "major", 4),
			chord("Em", 4, "minor", 2),
			{ kind: "rest", beats: 2 },
			chord("C", 0, "major", 1),
			chord("D", 2, "major", 1),
			chord("F♯m", 6, "minor", 2),
		];
		const text = progressionChart(entries, { bpm: 92, beatsPerBar: 4, key: 1, name: "Loop" });
		const r = chartToProgression(text, opts);
		expect(r.errors).toEqual([]);
		expect(r.name).toBe("Loop");
		expect(r.data.key).toBe(1);
		expect(r.data.bpm).toBe(92);
		expect(
			r.data.entries.map((e) => [e.kind, e.beats, e.kind === "chord" ? e.notes : null]),
		).toEqual(entries.map((e) => [e.kind, e.beats, e.kind === "chord" ? e.notes : null]));
	});
});
