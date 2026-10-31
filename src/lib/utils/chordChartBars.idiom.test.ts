import { describe, expect, test } from "vite-plus/test";
import { chartBarSeconds } from "./chartBarSeconds.js";
import { chordChartBars } from "./chordChartBars.js";

/**
 * The band's own charts as stored in the app (MMKK, Kevin's hand,
 * 2026-10-30; text only, the escapes as the in-app editor saved them),
 * with each song's settings as the defaults. Their idiom is what the
 * parser learned on 2026-10-31 (stem-bench response "chart idiom"): bold
 * and numbered labels, the dot separator, `x N` after a chord, a
 * Structure outline, Logic-style parentheticals. Where a chart places its
 * sections is checked against the song's own sections data (the starts
 * the band set by hand) where the chart agrees with the recording.
 */
const sectionsOf = (md: string, defaults: { tempo: number; meter: string }) => {
	const read = chordChartBars(md, defaults)!;
	let t = 0;
	const out: [string, number, number][] = [];
	for (const b of read.bars) {
		if (b.section) out.push([b.section, b.measure, Math.round(t * 10) / 10]);
		t += chartBarSeconds(b.meter, b.bpm);
	}
	return { bars: read.bars.length, sections: out, warnings: read.warnings };
};

const EAT_ALL_THE_CLOCKS = String.raw`key: Emin・4/4 ・ 120 bpm

**Structure**
Part 1・Part 2・Verse・Chorus・Bridge・Verse・Chorus x2・Outro

**I - Part 1**
\| Em Am | x14

**II  - Part 2**
D5 | A7 | Em7 | Em7 | C | D | A | A

**III - Verse**
E5(7) | Am7 G5(7) | x3

**IV - Chorus**
D5 | A7 | E5(7) | E5(7) | x3

**V - Bridge**
E5(7) | A5(7) | E5(7) | A5(7) | -- | -- | A5(7) riff x2

**VI - Out**
Em`;

const INTERBELLUM = String.raw`**I - Verse**
\| C | G C | x4 \*\*

**II - Chorus**
\| F | G | C | C | F | Am7 | G/B | G

**III - Bridge**
\| E7 | Am | E7 | Am | F | Fm | E7 | E7

**IV - Interlude**
\| E | E

**V - DAOM**
\| A | E A | x4

**VI - Outro**
\| F | Gsus2 | C

\* ask Karl for the detailed chord chart
\*\* the second verse is two bars longer

DAOM = Dicking Around on the Moon`;

const LETTER_LANDS = String.raw`key: F#maj・4/4・bpm 132

**Structure**
Intro・Verse・Chorus・Verse・Chorus・Bridge・Verse・Chorus・Verse・Outro

**I - Intro**
\| F♯(5)(7) Esus4 | x4

**II - Verse**
\| F♯(5)(7) Esus4 | x8

**III - Chorus**
\|  B5(7) x2  |  F#(5) x2  |  C#(5)(7)  |  E5(7)  |  F#(5)(7) Esus4  |  F#(5)(7) Esus4  |

**IV - Bridge**
D5(7)  |  E5(7)  |  D5(7)  |  E5(7)  |  F#(5)(7)  |  F#(5)(7)  |  C#(7)  |  C#(7)

**V - Outro**
\| B5(7) Asus4 | x4
\| F♯(5)(7) Esus4 | x4`;

const MOP_HEART = String.raw`Key: Amaj・3/4・224 bpm

Structure
Intro・Verse・Chorus・Verse・Chorus・Verse x2・Outro

I - Intro
A・D・E・A

II - Verse
A・D・E・A | x4

III - Chorus
G x4・A x4・F x4 ・A x4・G x4・E x8

IV - Outro (key change -> Bmaj)
B・E・F#・B | x4`;

const PEACEFUL_DREAMS = String.raw`Key: D · 145 bpm

**Structure**
Intro・VI・Chorus ・VI・Chorus・Bridge ・VII ・VI・Interlude・Outro

**Intro**
D(7)sus4・D(7)Sus4・C5・G5(7)・D(7)sus4 x 8

**Verse**
D5 x2・A5 x2・G5(7) x2・D5 x2・A5・B5(7)・G5(7) x4・D5 x2・A5・G5(7)・D5 x2

**Chorus**
G5(7) x2・D5 x2・C5・G5(7)・D(7)sus4 x2

**Verse II**
D x2・A x2・G x2・D・A・Bm・G x4・D x2・A・Gm・D x2

**Interlude**
D(7)Sus4 x4

**Outro**
Dmaj x20`;

describe("chordChartBars on the band's stored charts", () => {
	test("Letter Lands: escaped grids, parenthetical qualities, a Structure of ten plays; every section lands where the band set it", () => {
		const read = sectionsOf(LETTER_LANDS, { tempo: 132, meter: "4/4" });
		expect(read.bars).toBe(76);
		expect(read.warnings).toEqual([]);
		expect(read.sections).toEqual([
			["Intro", 1, 0],
			["Verse", 5, 7.3],
			["Chorus", 13, 21.8],
			["Verse", 21, 36.4],
			["Chorus", 29, 50.9],
			["Bridge", 37, 65.5],
			["Verse", 45, 80],
			["Chorus", 53, 94.5],
			["Verse", 61, 109.1],
			["Outro", 69, 123.6],
		]);
		const bars = chordChartBars(LETTER_LANDS, { tempo: 132, meter: "4/4" })!.bars;
		expect(bars[0]!.chords).toEqual(["F♯(5)(7)", "Esus4"]);
		expect(bars[12]!.chords).toEqual(["B5(7)"]);
		expect(bars[13]!.chords).toEqual(["B5(7)"]);
		expect(bars.every((b) => b.key === "F♯ major" && b.meter === "4/4" && b.bpm === 132)).toBe(
			true,
		);
	});

	test("Mop Heart: unbold numbered labels, dots between bars, a bare Structure label, a key change in the Outro's parenthetical", () => {
		const read = sectionsOf(MOP_HEART, { tempo: 224, meter: "3/4" });
		expect(read.bars).toBe(140);
		expect(read.warnings).toEqual([]);
		expect(read.sections).toEqual([
			["Intro", 1, 0],
			["Verse", 5, 3.2],
			["Chorus", 21, 16.1],
			["Verse", 49, 38.6],
			["Chorus", 65, 51.4],
			["Verse", 93, 73.9],
			["Verse", 109, 86.8],
			["Outro", 125, 99.6],
		]);
		const bars = chordChartBars(MOP_HEART, { tempo: 224, meter: "3/4" })!.bars;
		expect(bars[0]!.key).toBe("A major");
		expect(bars[124]!.key).toBe("B major");
		expect(bars[124]!.chords).toEqual(["B"]);
	});

	test("Eat All the Clocks: a Structure by name with 'Outro' for 'Out' and 'Chorus x2', hold dashes, a word in a bar ignored with a warning", () => {
		const read = sectionsOf(EAT_ALL_THE_CLOCKS, { tempo: 120, meter: "4/4" });
		expect(read.bars).toBe(79);
		expect(read.sections.map(([name, bar]) => `${name}@${bar}`)).toEqual([
			"Part 1@1",
			"Part 2@15",
			"Verse@23",
			"Chorus@29",
			"Bridge@41",
			"Verse@49",
			"Chorus@55",
			"Chorus@67",
			"Out@79",
		]);
		expect(read.warnings).toEqual(['Line 19: "riff" is not a chord; ignored']);
		const bars = chordChartBars(EAT_ALL_THE_CLOCKS, { tempo: 120, meter: "4/4" })!.bars;
		expect(bars[0]!.chords).toEqual(["Em", "Am"]);
		expect(bars[13]!.chords).toEqual(["Em", "Am"]);
		// The Bridge's "--" bars hold the harmony before them.
		expect(bars.slice(40, 48).map((b) => b.chords.join(" "))).toEqual([
			"E5(7)",
			"A5(7)",
			"E5(7)",
			"A5(7)",
			"",
			"",
			"A5(7)",
			"A5(7)",
		]);
	});

	test("Interbellum: no Structure, so the chart is read as written; a footnote mark after a repeat, footnote lines as words", () => {
		const read = sectionsOf(INTERBELLUM, { tempo: 115, meter: "4/4" });
		expect(read.bars).toBe(37);
		expect(read.warnings).toEqual([]);
		expect(read.sections.map(([name, bar]) => `${name}@${bar}`)).toEqual([
			"Verse@1",
			"Chorus@9",
			"Bridge@17",
			"Interlude@25",
			"DAOM@27",
			"Outro@35",
		]);
	});

	test("Peaceful Dreams: the Structure names sections the chart does not define (VI, VII, Bridge), so it warns and reads the chart as written", () => {
		const read = sectionsOf(PEACEFUL_DREAMS, { tempo: 145, meter: "4/4" });
		expect(read.bars).toBe(83);
		expect(read.sections.map(([name]) => name)).toEqual([
			"Intro",
			"Verse",
			"Chorus",
			"Verse II",
			"Interlude",
			"Outro",
		]);
		expect(read.warnings).toEqual([
			'Line 4: the Structure names "VI", which is no section of the chart; the chart is read in the order written',
		]);
		const bars = chordChartBars(PEACEFUL_DREAMS, { tempo: 145, meter: "4/4" })!.bars;
		expect(bars.slice(0, 5).map((b) => b.chords[0])).toEqual([
			"D(7)sus4",
			"D(7)Sus4",
			"C5",
			"G5(7)",
			"D(7)sus4",
		]);
		expect(bars.slice(-20).every((b) => b.chords[0] === "Dmaj")).toBe(true);
	});
});
