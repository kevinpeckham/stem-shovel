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
		expect(warnings[0]).toMatch(/3 flats, yet none of its 16 chord symbols/);
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

	test("the reader's Note lines come through as warnings", () => {
		expect(chartReadWarnings(`${clean}\nNote: page 3 is too blurred to read.`)).toEqual([
			"The reader notes: page 3 is too blurred to read.",
		]);
	});
});
