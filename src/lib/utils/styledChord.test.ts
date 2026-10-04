import { describe, expect, it } from "vite-plus/test";
import { styledChord, styledChordName } from "./styledChord";

describe("styledChord", () => {
	it("keeps plain as the triads with the pad's seventh", () => {
		expect(styledChord("plain", 0, "major", false, "dominant").intervals).toEqual([0, 4, 7]);
		expect(styledChord("plain", 0, "major", true, "dominant").intervals).toEqual([0, 4, 7, 10]);
		expect(styledChord("plain", 0, "major", true, "major7").intervals).toEqual([0, 4, 7, 11]);
		expect(styledChord("plain", 3, "minor", true, "major7").intervals).toEqual([0, 3, 7, 10]);
	});
	it("puts dominant sevenths on every blues wedge and ninths under the pad", () => {
		expect(styledChord("blues", 11, "major", false, "dominant").suffix).toBe("7");
		expect(styledChord("blues", 7, "major", false, "dominant").suffix).toBe("7");
		expect(styledChord("blues", 0, "major", true, "dominant").intervals).toContain(14);
		expect(styledChord("blues", 2, "minor", false, "dominant").intervals).toEqual([0, 3, 7, 10]);
	});
	it("voices jazz by degree: maj7 on I and IV, 7 on V, m7♭5 on vii", () => {
		expect(styledChord("jazz", 0, "major", false, "dominant").suffix).toBe("maj7");
		expect(styledChord("jazz", 11, "major", false, "dominant").suffix).toBe("maj7");
		expect(styledChord("jazz", 1, "major", false, "dominant").suffix).toBe("7");
		expect(styledChord("jazz", 1, "major", true, "dominant").suffix).toBe("13");
		expect(styledChord("jazz", 10, "major", false, "dominant").suffix).toBe("7");
		expect(styledChord("jazz", 5, "minor", false, "dominant").intervals).toEqual([0, 3, 6, 10]);
		expect(styledChord("jazz", 2, "minor", true, "dominant").suffix).toBe("9");
	});
	it("stacks lush extensions", () => {
		expect(styledChord("lush", 0, "major", false, "dominant").suffix).toBe("maj9");
		expect(styledChord("lush", 0, "major", true, "dominant").intervals).toContain(21);
		expect(styledChord("lush", 4, "minor", false, "dominant").suffix).toBe("11");
		expect(styledChord("lush", 1, "major", false, "dominant").suffix).toBe("13");
	});
	it("plays folk shapes and power chords", () => {
		expect(styledChord("folk", 0, "major", false, "dominant").suffix).toBe("add9");
		expect(styledChord("folk", 0, "major", true, "dominant").intervals).toEqual([0, 4, 8]);
		expect(styledChord("folk", 1, "major", false, "dominant").intervals).toEqual([0, 5, 7]);
		expect(styledChord("folk", 1, "major", true, "dominant").suffix).toBe("7sus4");
		expect(styledChord("folk", 3, "minor", false, "dominant").suffix).toBe("7");
		expect(styledChord("fifths", 2, "major", false, "dominant").intervals).toEqual([0, 7, 12]);
		expect(styledChord("fifths", 3, "minor", false, "dominant").intervals).toEqual([0, 7, 12]);
	});
	it("plays honky-tonk sixths, ragtime chains and bossa colours", () => {
		expect(styledChord("honkytonk", 0, "major", false, "dominant").suffix).toBe("6");
		expect(styledChord("honkytonk", 0, "major", true, "dominant").suffix).toBe("6/9");
		expect(styledChord("honkytonk", 3, "major", false, "dominant").suffix).toBe("7"); // VI7
		expect(styledChord("ragtime", 2, "major", false, "dominant").suffix).toBe("7"); // II7
		expect(styledChord("ragtime", 0, "major", false, "dominant").intervals).toEqual([0, 4, 7]);
		expect(styledChord("ragtime", 3, "minor", true, "dominant").intervals).toEqual([0, 3, 6, 9]);
		expect(styledChord("bossa", 0, "major", true, "dominant").intervals).toEqual([0, 4, 7, 9, 14]);
		expect(styledChord("bossa", 1, "major", false, "dominant").suffix).toBe("9");
		expect(styledChord("bossa", 1, "major", true, "dominant").intervals).toContain(13);
	});
	it("treats the relative minor as home in the Minor style", () => {
		expect(styledChord("minor", 3, "minor", false, "dominant").intervals).toEqual([0, 3, 7]); // i
		expect(styledChord("minor", 4, "major", false, "dominant").suffix).toBe("7"); // V of the minor (E7 in A minor)
		expect(styledChord("minor", 5, "minor", false, "dominant").suffix).toBe("7♭5"); // ii°
		expect(styledChord("minor", 11, "major", false, "dominant").intervals).toEqual([0, 4, 7]); // VI
		expect(styledChord("minor", 2, "minor", true, "dominant").suffix).toBe("7"); // iv7 under the pad
	});
	it("splits jazz into bebop and cool", () => {
		expect(styledChord("bebop", 0, "major", false, "dominant").suffix).toBe("6");
		expect(styledChord("bebop", 0, "major", true, "dominant").suffix).toBe("6/9");
		expect(styledChord("bebop", 1, "major", false, "dominant").suffix).toBe("7♭9");
		expect(styledChord("bebop", 1, "major", true, "dominant").suffix).toBe("13");
		expect(styledChord("bebop", 3, "major", false, "dominant").suffix).toBe("7♭9");
		expect(styledChord("bebop", 11, "major", false, "dominant").suffix).toBe("maj7");
		expect(styledChord("bebop", 5, "minor", true, "dominant").suffix).toBe("°7");
		expect(styledChord("cool", 0, "major", false, "dominant").suffix).toBe("6/9");
		expect(styledChord("cool", 1, "major", false, "dominant").suffix).toBe("9");
		expect(styledChord("cool", 1, "major", true, "dominant").suffix).toBe("13");
		expect(styledChord("cool", 2, "minor", false, "dominant").suffix).toBe("9");
		expect(styledChord("cool", 2, "minor", true, "dominant").suffix).toBe("11");
		expect(styledChord("cool", 5, "minor", false, "dominant").intervals).toEqual([0, 3, 6, 10]);
	});
	it("names the chord from the root and the recipe", () => {
		expect(styledChordName("C", "major", styledChord("jazz", 0, "major", false, "dominant"))).toBe(
			"Cmaj7",
		);
		expect(styledChordName("Bm", "minor", styledChord("jazz", 5, "minor", false, "dominant"))).toBe(
			"Bm7♭5",
		);
		expect(
			styledChordName("Am", "minor", styledChord("plain", 3, "minor", false, "dominant")),
		).toBe("Am");
		expect(styledChordName("G", "major", styledChord("lush", 1, "major", false, "dominant"))).toBe(
			"G13",
		);
		expect(
			styledChordName("Am", "minor", styledChord("fifths", 3, "minor", false, "dominant")),
		).toBe("A5");
		expect(styledChordName("G", "major", styledChord("folk", 1, "major", false, "dominant"))).toBe(
			"Gsus4",
		);
		expect(styledChordName("C", "major", styledChord("folk", 0, "major", true, "dominant"))).toBe(
			"C+",
		);
		expect(
			styledChordName("Am", "minor", styledChord("ragtime", 3, "minor", true, "dominant")),
		).toBe("A°7");
		expect(styledChordName("G", "major", styledChord("bossa", 1, "major", true, "dominant"))).toBe(
			"G7♭9",
		);
	});
});
