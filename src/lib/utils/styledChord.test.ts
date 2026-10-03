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
	});
});
