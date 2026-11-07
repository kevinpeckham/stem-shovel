import { describe, expect, it } from "vite-plus/test";
import { checkTimingMap } from "@barmark/sync";
import { buildChartFromDetections, type ChartBuildSong } from "./chartBuild";
import type { SongChange } from "#lib/val/SongChangeSchema.js";

const song = (over: Partial<ChartBuildSong> = {}): ChartBuildSong => ({
	title: "Track",
	changes: [
		{ kind: "tempo", start: 0, value: "120" },
		{ kind: "meter", start: 0, value: "4/4" },
		{ kind: "key", start: 0, value: "E♭ major" },
	],
	sections: [],
	mixKey: "mix-1",
	chordsJson: null,
	...over,
});
/** Four bars of 2 s: 120 bpm in 4/4. */
const GRID = [0, 2, 4, 6, 8];
const SEGMENTS = [
	{ bar: 1, bars: 2, chord: "Eb" },
	{ bar: 3, bars: 1, chord: "Ab" },
	{ bar: 4, bars: 1, chord: "N.C." },
];

describe("buildChartFromDetections", () => {
	it("the matcher's segments become the chart on the grid, with a timing map that checks", () => {
		const built = buildChartFromDetections(song({ sections: [{ name: "Verse", start: 0 }] }), {
			grid: GRID,
			chords: SEGMENTS,
			source: "matcher",
		});
		expect(built.chart).toContain("key: Eb, time: 4/4, tempo: 120");
		expect(built.chart).toContain("## Verse");
		expect(built.chart).toMatch(/\| Eb \| (%|\/) \| Ab \| N\.C\. \|/);
		expect(built.timing).toMatchObject({
			format: "barmark-timing",
			chart: { bars: 4 },
			recording: { id: "mix-1", duration: 8 },
			bars: [
				{ bar: 1, start: 0 },
				{ bar: 2, start: 2 },
				{ bar: 3, start: 4 },
				{ bar: 4, start: 6 },
			],
			end: 8,
		});
		expect(checkTimingMap(built.timing, { text: built.chart }).map).not.toBeNull();
		expect(built.confidence?.bars).toHaveLength(4);
	});

	it("the chord model's stored runs (Harte labels in frames) are used as they are", () => {
		const built = buildChartFromDetections(
			song({
				chordsJson: {
					version: "v1",
					frameSec: 0.5,
					frames: 16,
					runs: [
						{ start: 0, end: 8, chord: "Cm", label: "C:min" },
						{ start: 8, end: 16, chord: "Cm7(b5)", label: "C:hdim7" },
					],
				},
			}),
			// The segments are ignored on this path.
			{ grid: GRID, chords: SEGMENTS, source: "model" },
		);
		expect(built.chart).toContain("Cm");
		expect(built.chart).toContain("Cm7(b5)");
		expect(built.chart).not.toContain("Ab");
	});

	it("the matcher's segments stand in when the model named the chords but none are stored", () => {
		const built = buildChartFromDetections(song(), {
			grid: GRID,
			chords: SEGMENTS,
			source: "model",
		});
		expect(built.chart).toContain("Ab");
	});

	it("a 6/8 tempo change is converted to barmark's dotted-quarter beat; key changes are respelled", () => {
		const changes: SongChange[] = [
			{ kind: "tempo", start: 0, value: "120" },
			{ kind: "meter", start: 0, value: "6/8" },
			{ kind: "tempo", start: 6, value: "180" },
			{ kind: "key", start: 6, value: "G# major" },
		];
		// 120 eighths: a bar of six is 3 s.
		const built = buildChartFromDetections(song({ changes }), {
			grid: [0, 3, 6, 8, 10],
			chords: [{ bar: 1, bars: 4, chord: "C" }],
			source: "matcher",
		});
		expect(built.chart).toContain("time: 6/8, tempo: 40");
		expect(built.chart).toContain("tempo: 60");
		expect(built.chart).toContain("key: Ab");
	});

	it("an unusable grid gives no chart and no map, with the builder's error", () => {
		const built = buildChartFromDetections(song(), {
			grid: [0, 0],
			chords: SEGMENTS,
			source: "matcher",
		});
		expect(built.chart).toBe("");
		expect(built.timing).toBeNull();
		expect(built.diagnostics).toContainEqual({ level: "error", message: expect.any(String) });
	});
});
