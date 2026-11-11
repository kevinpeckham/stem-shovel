import { describe, expect, it } from "vite-plus/test";
import { checkTimingMap } from "@barmark/sync";
import { buildChartFromDetections, type ChartBuildSong } from "./chartBuild";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";
import type { TrackerBarGrid } from "#lib/utils/trackerBarGrid.js";

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
		expect(built.grid).toEqual(GRID);
		expect(built.onTracker).toBe(false);
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

	describe("on the beat tracker's bars", () => {
		/** Five bars of 3/4 at 2.5 s: not the song's 4/4 at 120. */
		const TRACKER: TrackerBarGrid = {
			bars: [0, 2.5, 5, 7.5, 10, 12.5],
			meter: "3/4",
			barSeconds: 2.5,
		};
		const RUNS: ChordminiRuns = {
			version: "v1",
			frameSec: 0.5,
			frames: 25,
			runs: [
				{ start: 0, end: 10, chord: "Cm", label: "C:min" },
				{ start: 10, end: 25, chord: "G7", label: "G:7" },
			],
		};

		it("with the chord model's runs the tracker's bars and meter replace the browser's grid", () => {
			const built = buildChartFromDetections(song({ chordsJson: RUNS }), {
				grid: GRID,
				chords: SEGMENTS,
				source: "model",
				tracker: TRACKER,
			});
			expect(built.onTracker).toBe(true);
			expect(built.grid).toEqual(TRACKER.bars);
			expect(built.chart).toContain("time: 3/4");
			expect(built.chart).not.toContain("time: 4/4");
			expect(built.chart).toContain("Cm");
			expect(built.chart).toContain("G7");
			expect(built.timing).toMatchObject({
				chart: { bars: 5 },
				recording: { id: "mix-1", duration: 12.5 },
				end: 12.5,
			});
			expect(checkTimingMap(built.timing, { text: built.chart }).map).not.toBeNull();
		});

		it("ignored for the notes matcher's chords", () => {
			const built = buildChartFromDetections(song({ chordsJson: RUNS }), {
				grid: GRID,
				chords: SEGMENTS,
				source: "matcher",
				tracker: TRACKER,
			});
			expect(built.onTracker).toBe(false);
			expect(built.grid).toEqual(GRID);
			expect(built.chart).toContain("time: 4/4");
			expect(built.timing).toMatchObject({ chart: { bars: 4 }, end: 8 });
		});

		it("ignored when the model named the chords but none are stored", () => {
			const built = buildChartFromDetections(song(), {
				grid: GRID,
				chords: SEGMENTS,
				source: "model",
				tracker: TRACKER,
			});
			expect(built.onTracker).toBe(false);
			expect(built.grid).toEqual(GRID);
			expect(built.chart).toContain("time: 4/4");
		});

		it("the song's tempo and meter changes are left out; its key changes are kept", () => {
			const changes: SongChange[] = [
				{ kind: "tempo", start: 0, value: "120" },
				{ kind: "meter", start: 0, value: "4/4" },
				{ kind: "key", start: 0, value: "C minor" },
				{ kind: "tempo", start: 5, value: "180" },
				{ kind: "meter", start: 5, value: "6/8" },
				{ kind: "key", start: 5, value: "G# major" },
			];
			const built = buildChartFromDetections(song({ changes, chordsJson: RUNS }), {
				grid: GRID,
				chords: SEGMENTS,
				source: "model",
				tracker: TRACKER,
			});
			expect(built.onTracker).toBe(true);
			expect(built.chart).toContain("key: Ab");
			expect(built.chart).not.toContain("6/8");
			expect(built.chart).not.toContain("tempo: 180");
			expect(built.chart).not.toContain("tempo: 120");
		});
	});
});
