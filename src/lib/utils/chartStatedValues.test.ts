import { describe, expect, test } from "vite-plus/test";
import { chartStatedValues } from "./chartStatedValues.js";

describe("chartStatedValues: a barmark chart", () => {
	test("a score's read: the first bar's tempo, every tempo: line in order, the first bar's meter", () => {
		const read = `# Exiles
Part: Piano
key: Eb, time: 3/4, tempo: 96
| @A | Eb Bb/D | Cm7 Ab |
time: 4/4, tempo: 120
| Abmaj7 | Bb |
tempo: 88
| Fm7 | Eb |
Note: page 3 is unreadable`;
		expect(chartStatedValues(read)).toEqual({ tempo: 96, tempoMarks: [96, 120, 88], meter: "3/4" });
	});

	test("the band's own chart: a tempo: directive is its tempo (the prose reader never saw one)", () => {
		expect(chartStatedValues("key: D, tempo: 120\n## Verse\n| D | G | A |")).toEqual({
			tempo: 120,
			tempoMarks: [120],
			meter: null,
		});
	});

	test("no time: line states no meter, though barmark plays it in 4/4; one anywhere states the first bar's", () => {
		expect(chartStatedValues("tempo: 90\n| D | G |").meter).toBeNull();
		expect(chartStatedValues("tempo: 90\n| D |\ntime: 6/8\n| G |").meter).toBe("4/4");
		expect(chartStatedValues("time: 6/8\n| D | G |").meter).toBe("6/8");
	});

	test("without directives the prose still states them; a gradual change is no tempo mark", () => {
		expect(chartStatedValues("Key: D · 145 bpm · 3/4\n| D | G |")).toEqual({
			tempo: 145,
			tempoMarks: [145],
			meter: "3/4",
		});
		expect(chartStatedValues("tempo: 100\n| D |\ntempo: rit.\n| G |").tempoMarks).toEqual([100]);
		expect(chartStatedValues("tempo: 999\n| D |").tempo).toBeNull();
	});
});

describe("chartStatedValues", () => {
	test("a score summary: the first tempo mark, every mark in measure order, the first time signature", () => {
		const summary = `Title: Exiles
m1 key E♭ major 3/4 tempo 96 [A Verse]: E♭ B♭/D Cm7 A♭
m5: E♭ Gm7 A♭ B♭7
m9 4/4 tempo 120 [B Chorus]: A♭maj7 B♭ Gm Cm
m17 tempo 88: Fm7 B♭sus4 B♭ E♭`;
		expect(chartStatedValues(summary)).toEqual({
			tempo: 96,
			tempoMarks: [96, 120, 88],
			meter: "3/4",
		});
	});

	test("a summary without tempo marks or time signatures states neither; slash chords are not meters", () => {
		expect(chartStatedValues("m1 key D major: D G/B A\nm5: D 6/9 A")).toEqual({
			tempo: null,
			tempoMarks: [],
			meter: null,
		});
	});

	test("a band's chart: bpm or a note = N for the tempo, a standalone d/d for the meter", () => {
		expect(chartStatedValues("# Intro\n120 bpm, in 3/4\n| D | G | A |")).toEqual({
			tempo: 120,
			tempoMarks: [120],
			meter: "3/4",
		});
		expect(chartStatedValues("♩ = 132\n# Verse\n| Am | F |\n# Bridge ♪=90")).toMatchObject({
			tempo: 132,
			tempoMarks: [132, 90],
			meter: null,
		});
	});

	test("the band's header: dots between the facts, the word bpm first", () => {
		expect(chartStatedValues("key: F#maj・4/4・bpm 132\n| F# | E |")).toEqual({
			tempo: 132,
			tempoMarks: [132],
			meter: "4/4",
		});
		expect(chartStatedValues("Key: Amaj・3/4・224 bpm").meter).toBe("3/4");
		expect(chartStatedValues("Key: D · 145 bpm").tempo).toBe(145);
	});

	test("dates and fractions in words are not time signatures; a bare chord chart states nothing", () => {
		expect(chartStatedValues("Written 10/12/2025\nhalf/1/2 time feel\n| D | G |").meter).toBeNull();
		expect(chartStatedValues("# Intro\n| D | G | A | x2\n# Verse\n| Bm | G | D | A/C# |")).toEqual({
			tempo: null,
			tempoMarks: [],
			meter: null,
		});
		expect(chartStatedValues("")).toEqual({ tempo: null, tempoMarks: [], meter: null });
	});
});

test("a tempo mark outside 20–400 bpm is no mark", () => {
	expect(chartStatedValues("m1 key C major 4/4 tempo 1200: C F").tempo).toBeNull();
	expect(chartStatedValues("Intro\n5 bpm\nC F G").tempo).toBeNull();
});
