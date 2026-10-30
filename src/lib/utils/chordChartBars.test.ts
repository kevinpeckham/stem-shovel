import { describe, expect, test } from "vite-plus/test";
import { chordChartBars } from "./chordChartBars.js";

const none: { tempo: number | null; meter: string | null } = { tempo: null, meter: null };
const chordsOf = (md: string, defaults = none) =>
	chordChartBars(md, defaults)!.bars.map((b) => b.chords.join(" "));

describe("chordChartBars", () => {
	test("headings are sections, grid cells are bars, the tempo and key from the chart's words", () => {
		const md = `Key: D, 120 bpm

## Verse
\`\`\`
| D | A | Bm | G |
\`\`\`

## Chorus
| G | A | D | D |`;
		const read = chordChartBars(md, none)!;
		expect(read.bars.map((b) => [b.measure, b.chords.join(" "), b.section])).toEqual([
			[1, "D", "Verse"],
			[2, "A", null],
			[3, "Bm", null],
			[4, "G", null],
			[5, "G", "Chorus"],
			[6, "A", null],
			[7, "D", null],
			[8, "D", null],
		]);
		expect(read.bars.every((b) => b.bpm === 120 && b.meter === "4/4" && b.key === "D major")).toBe(
			true,
		);
		expect(read.warnings).toEqual([]);
	});

	test("two symbols split a cell, % and / play the previous bar again, N.C. is silence", () => {
		expect(chordsOf("| D G | % | / | N.C. | Em |", { tempo: 100, meter: null })).toEqual([
			"D G",
			"D G",
			"D G",
			"N.C.",
			"Em",
		]);
	});

	test("x2 after a line plays it again; x2 in a heading plays the section again", () => {
		const md = `♩ = 90
## Intro x2
| D | A |
## Verse
| G | D | x2
Em C`;
		const read = chordChartBars(md, none)!;
		expect(read.bars.map((b) => b.chords.join(" "))).toEqual([
			"D",
			"A",
			"D",
			"A",
			"G",
			"D",
			"G",
			"D",
			"Em",
			"C",
		]);
		expect(read.bars.map((b) => b.section)).toEqual([
			"Intro",
			null,
			"Intro",
			null,
			"Verse",
			null,
			null,
			null,
			null,
			null,
		]);
		expect(read.bars.every((b) => b.bpm === 90)).toBe(true);
	});

	test("|: … :| across lines repeats them once", () => {
		expect(chordsOf("|: C | F |\n| G | C :|\n| Am |", { tempo: 100, meter: "4/4" })).toEqual([
			"C",
			"F",
			"G",
			"C",
			"C",
			"F",
			"G",
			"C",
			"Am",
		]);
	});

	test("lyrics lines are skipped; bare chord lines are a bar per chord", () => {
		const md = `## Verse
D        A
Oh the river runs
Bm       G
down to the sea`;
		expect(chordsOf(md, { tempo: 100, meter: null })).toEqual(["D", "A", "Bm", "G"]);
	});

	test("labeled lines start sections; a key in the words applies from the next bar, the chart's first tempo and meter from the start", () => {
		const md = `Intro: D A
[Chorus]
| G | A |
Key of E major, 140 bpm, 3/4
| E | B |
♩ = 80
| A |`;
		const read = chordChartBars(md, { tempo: 100, meter: null })!;
		expect(read.bars.map((b) => [b.chords[0], b.section, b.bpm, b.meter, b.key])).toEqual([
			["D", "Intro", 140, "3/4", null],
			["A", null, 140, "3/4", null],
			["G", "Chorus", 140, "3/4", null],
			["A", null, 140, "3/4", null],
			["E", null, 140, "3/4", "E major"],
			["B", null, 140, "3/4", "E major"],
			["A", null, 80, "3/4", "E major"],
		]);
	});

	test("the song's tempo and meter when the chart states none; a grid with words is a warning", () => {
		const read = chordChartBars("| D | A |\n| hello | there |", { tempo: 96, meter: "6/8" })!;
		expect(read.bars.map((b) => [b.bpm, b.meter])).toEqual([
			[96, "6/8"],
			[96, "6/8"],
		]);
		expect(read.warnings).toEqual(['Line 2: "| hello | there |" has words in its grid; left out']);
	});

	test("minor keys read from the chart's words", () => {
		const read = chordChartBars("Key: Bm\n| Bm | G |", { tempo: 96, meter: null })!;
		expect(read.bars[0]!.key).toBe("B minor");
		expect(
			chordChartBars("key of B♭ minor\n| Bbm |", { tempo: 96, meter: null })!.bars[0]!.key,
		).toBe("B♭ minor");
	});

	test("no tempo anywhere, or no bars, is nothing to render", () => {
		expect(chordChartBars("| D | A |", none)).toBeNull();
		expect(chordChartBars("120 bpm\nJust some words about the song", none)).toBeNull();
	});
});
