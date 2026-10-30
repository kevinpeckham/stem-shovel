import { describe, expect, test } from "vite-plus/test";
import { chartBars } from "./chartBars.js";

const none: { tempo: number | null; meter: string | null } = { tempo: null, meter: null };

describe("chartBars", () => {
	test("a repeat with two endings plays in order, with the chart's measure numbers", () => {
		const summary = `Title: Song
Part: Lead sheet
m1 key D major 4/4 tempo 100 |: [A Verse]: D
m2: G
m3 ending 1: A
m4 :|: A7
m5 ending 2: Bm
m6: G`;
		const read = chartBars(summary, none)!;
		expect(read.bars.map((b) => b.measure)).toEqual([1, 2, 3, 4, 1, 2, 5, 6]);
		expect(read.bars.map((b) => b.chords.join(" "))).toEqual([
			"D",
			"G",
			"A",
			"A7",
			"D",
			"G",
			"Bm",
			"G",
		]);
		expect(read.bars.map((b) => b.section)).toEqual([
			"A Verse",
			null,
			null,
			null,
			"A Verse",
			null,
			null,
			null,
		]);
		expect(read.warnings).toEqual([]);
	});

	test("a repeat without |: repeats from the start, then from the bar after the previous :|", () => {
		const summary = `m1 tempo 90 4/4: C
m2 :|: G
m3: F
m4 :|: C`;
		expect(chartBars(summary, none)!.bars.map((b) => b.measure)).toEqual([1, 2, 1, 2, 3, 4, 3, 4]);
	});

	test("measures the summary leaves out hold the harmony before them", () => {
		const read = chartBars("m1 key G major 3/4 tempo 120: G\nm4: C", none)!;
		expect(read.bars.map((b) => [b.measure, b.chords])).toEqual([
			[1, ["G"]],
			[2, []],
			[3, []],
			[4, ["C"]],
		]);
		expect(read.bars.every((b) => b.key === "G major" && b.meter === "3/4")).toBe(true);
	});

	test("tempo, meter and key marks apply from their measure on; the defaults before the first", () => {
		const summary = `m1: D
m2 key E♭ major 3/4 tempo 96: E♭
m3 tempo 132 "rit.": B♭
m4 6/8: E♭`;
		const read = chartBars(summary, { tempo: 110, meter: "4/4" })!;
		expect(read.bars.map((b) => [b.bpm, b.meter, b.key])).toEqual([
			[110, "4/4", null],
			[96, "3/4", "E♭ major"],
			[132, "3/4", "E♭ major"],
			[132, "6/8", "E♭ major"],
		]);
		expect(read.bars.map((b) => b.section)).toEqual([null, null, null, null]);
	});

	test("without a default, the first mark applies from the start", () => {
		const read = chartBars("m1: D\nm3 tempo 100 3/4: G", none)!;
		expect(read.bars.map((b) => [b.bpm, b.meter])).toEqual([
			[100, "3/4"],
			[100, "3/4"],
			[100, "3/4"],
		]);
	});

	test("sections from rehearsal marks and section words; other words are not sections", () => {
		const summary = `m1 tempo 100 4/4 "Intro": D
m5 [B]: G
m9 "Verse 2": A
m13 "Pre-chorus" "a tempo": Bm
m17 "rit.": G`;
		const read = chartBars(summary, none)!;
		expect(read.bars.filter((b) => b.section).map((b) => [b.measure, b.section])).toEqual([
			[1, "Intro"],
			[5, "B"],
			[9, "Verse 2"],
			[13, "Pre-chorus"],
		]);
	});

	test("D.S. and coda are not followed: a warning, and the bars play straight through", () => {
		const read = chartBars('m1 tempo 100 4/4: C\nm2 "D.S. al Coda": G\nm3: F', none)!;
		expect(read.bars.map((b) => b.measure)).toEqual([1, 2, 3]);
		expect(read.warnings).toEqual(['m2: "D.S." is not followed; the bars play straight through']);
	});

	test("no tempo in the chart or the song is nothing to render", () => {
		expect(chartBars("m1 key D major 4/4: D\nm2: G", none)).toBeNull();
		expect(
			chartBars("Title: Nothing\nNote: the page was unreadable", { tempo: 100, meter: null }),
		).toBeNull();
	});

	test("Title, Part and Note lines are not measures; a missing meter is 4/4 with a warning", () => {
		const read = chartBars("Title: X\nPart: Piano (1 part)\nm1: C N.C.\nNote: m2 smudged", {
			tempo: 100,
			meter: null,
		})!;
		expect(read.bars).toEqual([
			{ measure: 1, chords: ["C", "N.C."], bpm: 100, meter: "4/4", key: null, section: null },
		]);
		expect(read.warnings).toEqual(["No time signature in the chart or the song: 4/4 assumed"]);
	});
});
