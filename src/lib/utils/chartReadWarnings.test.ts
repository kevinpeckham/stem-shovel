import { describe, expect, test } from "vite-plus/test";
import { chartReadWarnings, keySignatureSharps } from "./chartReadWarnings.js";

const clean = `Title: Exiles
Part: Lead sheet
m1 key E♭ major 4/4 tempo 96 [A Verse]: E♭ B♭/D Cm7 A♭
m5: E♭ Gm7 A♭ B♭7
m9 [B Chorus]: A♭maj7 B♭ Gm Cm
m13: Fm7 B♭sus4 B♭ E♭`;

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
		const corrupt = clean
			.split("\n")
			.map((line) => {
				const i = line.lastIndexOf(":");
				return i < 0 ? line : line.slice(0, i) + line.slice(i).replaceAll("♭", "");
			})
			.join("\n");
		const warnings = chartReadWarnings(corrupt);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(
			/calls for sharps or flats, yet none of its 16 chord symbols carries one where the key would/,
		);
		expect(warnings[0]).toMatch(/or the reader misread them/);
		// Too few chords, or a one-sharp key, is no evidence: G major songs go without an F♯ for pages.
		expect(chartReadWarnings("m1 key E major 4/4: E A B E\nm5: E A B")).toEqual([]);
		expect(chartReadWarnings(`m1 key G major 4/4: G C D Em\nm5: G C D G\nm9: C D G Em`)).toEqual(
			[],
		);
		// A flat on a bass note counts as a printed accidental.
		expect(
			chartReadWarnings(`m1 key Bb major 4/4: F C Dm C/Bb\nm5: F C Dm C\nm9: F C Dm C`),
		).toEqual([]);
	});

	test("an honest D-major chart of natural chords raises nothing (stem-bench Study 6's false-alarm class)", () => {
		// D major sharpens F and C; D, G, A, Bm and Em are the key's own chords and print no sharp.
		const dMajor = `m1 key D major 4/4 tempo 100: D G A D
m5: Bm G Em A
m9: D A Bm G
m13: Em A D D`;
		expect(chartReadWarnings(dMajor)).toEqual([]);
	});

	test("a modulating chart is judged section by section, against the key in force", () => {
		// G major then D major, bare chords honest in each: C is natural in G major, and pooling
		// D major's sharps across the chart would have called it suspicious.
		const modulating = `m1 key G major 4/4: G C D G
m5: Em C D G
m9 key D major: D G A D
m13: Bm G A D`;
		expect(chartReadWarnings(modulating)).toEqual([]);
		// The same chords with C under D major's scope are suspicious there.
		const misplaced = `m1 key D major 4/4: G C D G
m5: Em C D G
m9: D G A D
m13: Bm G A D`;
		expect(chartReadWarnings(misplaced)).toHaveLength(1);
	});

	test("an A♭-major read with every chord printed natural is flagged", () => {
		const lostFlats = `m1 key A♭ major 4/4 tempo 88: A D E A
m5: Fm D E A
m9: B Cm D E
m13: A Fm B E`;
		expect(chartReadWarnings(lostFlats)).toHaveLength(1);
		// One suspicious chord is not enough.
		expect(chartReadWarnings(`m1 key A♭ major 4/4: A Fm Cm Fm\nm5: Cm Fm Cm Fm`)).toEqual([]);
	});

	test("the reader's Note lines come through as warnings", () => {
		expect(chartReadWarnings(`${clean}\nNote: page 3 is too blurred to read.`)).toEqual([
			"The reader notes: page 3 is too blurred to read.",
		]);
	});
});
