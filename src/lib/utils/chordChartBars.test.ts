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

	test("bold lines and numbered labels are headings; the numeral and a trailing parenthetical leave the name, a key change in it applies", () => {
		const read = chordChartBars(
			"**Intro**\n| D |\nII - Verse\n| G |\n**III  - Outro (key change -> Bmaj)**\n| B |",
			{ tempo: 100, meter: null },
		)!;
		expect(read.bars.map((b) => [b.chords[0], b.section, b.key])).toEqual([
			["D", "Intro", null],
			["G", "Verse", null],
			["B", "Outro", "B major"],
		]);
	});

	test("the band's dots separate bars; x N after a chord plays that bar again, after the closing pipe the line", () => {
		expect(chordsOf("A・D・E・A", { tempo: 100, meter: null })).toEqual(["A", "D", "E", "A"]);
		expect(chordsOf("G x2・A x 3", { tempo: 100, meter: null })).toEqual(["G", "G", "A", "A", "A"]);
		expect(chordsOf("| D5 x2 | A5 | x2", { tempo: 100, meter: null })).toEqual([
			"D5",
			"D5",
			"A5",
			"D5",
			"D5",
			"A5",
		]);
		expect(chordsOf("Dmaj x20", { tempo: 100, meter: null })).toHaveLength(20);
		// A header line of dots is words, not a broken grid.
		const read = chordChartBars("key: F#maj・4/4・bpm 132\n| F# |", none)!;
		expect(read.warnings).toEqual([]);
		expect([read.bars[0]!.key, read.bars[0]!.bpm]).toEqual(["F♯ major", 132]);
	});

	test("dashes hold; a word beside a chord in a bar is ignored with a warning; the editor's escapes and a footnote mark are read through", () => {
		const read = chordChartBars("\\| E | -- | A riff x2 | \\*\\*\n\\* a note about it", {
			tempo: 100,
			meter: null,
		})!;
		expect(read.bars.map((b) => b.chords.join(" "))).toEqual(["E", "", "A", "A"]);
		expect(read.warnings).toEqual(['Line 1: "riff" is not a chord; ignored']);
	});

	test("a Structure outline plays the sections in its order, by numeral, by name or by a prefix, with x2 per entry", () => {
		const md = `**Structure**
Intro・II・Chorus x2・Out
**I - Intro**
| D |
**II - Verse**
| G | A |
**III - Chorus**
| C |
**IV - Outro**
| E |`;
		const read = chordChartBars(md, { tempo: 100, meter: null })!;
		expect(read.bars.map((b) => [b.chords[0], b.section])).toEqual([
			["D", "Intro"],
			["G", "Verse"],
			["A", null],
			["C", "Chorus"],
			["C", "Chorus"],
			["E", "Outro"],
		]);
		expect(read.warnings).toEqual([]);
		// The label with its outline on the same line, and a chart without one, read as written.
		expect(chordsOf("Form: B, A\n## A\n| D |\n## B\n| G |", { tempo: 100, meter: null })).toEqual([
			"G",
			"D",
		]);
		expect(chordsOf("## A\n| D |\n## B\n| G |", { tempo: 100, meter: null })).toEqual(["D", "G"]);
	});

	test("an outline naming a section the chart does not define, or one that fits several, is a warning and the chart stays as written", () => {
		const read = chordChartBars("Structure: Intro・Bridge\n## Intro\n| D |\n## Verse\n| G |", {
			tempo: 100,
			meter: null,
		})!;
		expect(read.bars.map((b) => b.chords[0])).toEqual(["D", "G"]);
		expect(read.warnings).toEqual([
			'Line 1: the Structure names "Bridge", which is no section of the chart; the chart is read in the order written',
		]);
		const two = chordChartBars("Structure: Verse\n## Verse 1\n| D |\n## Verse 2\n| G |", {
			tempo: 100,
			meter: null,
		})!;
		expect(two.warnings[0]).toContain("fits more than one section");
	});

	test("no tempo anywhere, or no bars, is nothing to render", () => {
		expect(chordChartBars("| D | A |", none)).toBeNull();
		expect(chordChartBars("120 bpm\nJust some words about the song", none)).toBeNull();
	});
});
