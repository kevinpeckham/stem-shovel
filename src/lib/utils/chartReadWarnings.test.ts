import { describe, expect, test } from "vite-plus/test";
import { chartReadWarnings, keySignatureSharps } from "./chartReadWarnings.js";

/** A score's read as `readChartWithAi` writes it: a barmark chart. */
const clean = `# Exiles
Part: Lead sheet
key: Eb, time: 4/4, tempo: 96
| @A | Eb Bb/D Cm7 Ab | Eb Gm7 Ab Bb7 |
| @B | Abmaj7 Bb Gm Cm | Fm7 Bbsus4 Bb Eb |`;
/** The same read with every flat dropped from the chords (the key line keeps its own). */
const lostFlats = clean
	.split("\n")
	.map((line) => (line.startsWith("|") ? line.replace(/(?<=[A-G])b/g, "") : line))
	.join("\n");
describe("chartReadWarnings", () => {
	test("a key's signature: sharps positive, flats negative, minors by their relative major, unknown null", () => {
		expect(keySignatureSharps("D major")).toBe(2);
		expect(keySignatureSharps("Ab major")).toBe(-4);
		expect(keySignatureSharps("F# minor")).toBe(3);
		expect(keySignatureSharps("d minor")).toBe(-1);
		expect(keySignatureSharps("atonal")).toBeNull();
	});

	test("a clean read raises nothing", () => {
		expect(chartReadWarnings(clean)).toEqual([]);
	});

	test("a signature of flats with every chord printed natural is the dropped-accidentals signature", () => {
		// The key signature is drawn on the staff and reads fine; the chord symbols are text in a font without flats.
		const warnings = chartReadWarnings(lostFlats);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(
			/calls for sharps or flats, yet none of its 16 chord symbols carries one where the key would/,
		);
		expect(warnings[0]).toMatch(/or the reader misread them/);
		// Too few chords, or a one-sharp key, is no evidence: G major songs go without an F♯ for pages.
		expect(chartReadWarnings("key: E\n| E A B E | E A B |")).toEqual([]);
		expect(chartReadWarnings("key: G\n| G C D Em | G C D G | C D G Em |")).toEqual([]);
		// A flat on a bass note counts as a printed accidental.
		expect(chartReadWarnings("key: Bb\n| F C Dm C/Bb | F C Dm C | F C Dm C |")).toEqual([]);
	});

	test("each written bar is judged once: a repeat does not count its chords again", () => {
		// Four suspicious-free chords played twice are still four chords, too few to judge.
		expect(chartReadWarnings("key: Ab\n|: A D E A :|")).toEqual([]);
		expect(chartReadWarnings("key: Ab\n|: A D E A | Fm D E A :|")).toHaveLength(1);
	});

	test("an honest D-major chart of natural chords raises nothing (stem-bench Study 6's false-alarm class)", () => {
		// D major sharpens F and C; D, G, A, Bm and Em are the key's own chords and print no sharp.
		const dMajor = "key: D, tempo: 100\n| D G A D | Bm G Em A |\n| D A Bm G | Em A D D |";
		expect(chartReadWarnings(dMajor)).toEqual([]);
	});

	test("a modulating chart is judged section by section, against the key in force", () => {
		// G major then D major, bare chords honest in each: C is natural in G major, and pooling
		// D major's sharps across the chart would have called it suspicious.
		const modulating = "key: G\n| G C D G | Em C D G |\nkey: D\n| D G A D | Bm G A D |";
		expect(chartReadWarnings(modulating)).toEqual([]);
		// The same chords with C under D major's scope are suspicious there.
		const misplaced = "key: D\n| G C D G | Em C D G |\n| D G A D | Bm G A D |";
		expect(chartReadWarnings(misplaced)).toHaveLength(1);
	});

	test("an A♭-major read with every chord printed natural is flagged; one suspicious chord is not enough", () => {
		expect(chartReadWarnings("key: Ab\n| A D E A | Fm D E A | B Cm D E | A Fm B E |")).toHaveLength(
			1,
		);
		expect(chartReadWarnings("key: Ab\n| A Fm Cm Fm | Cm Fm Cm Fm |")).toEqual([]);
	});

	test("a MusicXML summary (the m<n> form) is judged the same way", () => {
		const summary = `m1 key A♭ major 4/4 tempo 88: A D E A
m5: Fm D E A
m9: B Cm D E
m13: A Fm B E`;
		expect(chartReadWarnings(summary)).toHaveLength(1);
		expect(chartReadWarnings(`m1 key G major 4/4: G C D Em\nm5: G C D G\nm9: C D G Em`)).toEqual(
			[],
		);
		const modulating = `m1 key G major 4/4: G C D G
m5: Em C D G
m9 key D major: D G A D
m13: Bm G A D`;
		expect(chartReadWarnings(modulating)).toEqual([]);
	});

	test("the reader's Note lines come through as warnings", () => {
		expect(chartReadWarnings(`${clean}\nNote: page 3 is too blurred to read.`)).toEqual([
			"The reader notes: page 3 is too blurred to read.",
		]);
		expect(chartReadWarnings("m1 key C major: C\nNote: page 2 is missing")).toEqual([
			"The reader notes: page 2 is missing",
		]);
	});
});
