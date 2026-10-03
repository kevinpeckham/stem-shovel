import { describe, expect, it } from "vite-plus/test";
import { spellChord, spellNote } from "./noteSpelling";

describe("noteSpelling", () => {
	it("spells in sharps or flats", () => {
		expect(spellNote(61, false).name).toBe("C♯");
		expect(spellNote(61, true).name).toBe("D♭");
		expect(spellNote(60, true)).toMatchObject({ letter: "C", accidental: "", octave: 4 });
	});
	it("places notes on the treble staff from the bottom line", () => {
		expect(spellNote(64, false).step).toBe(0); // E4, the bottom line
		expect(spellNote(60, false).step).toBe(-2); // middle C, one ledger line below
		expect(spellNote(77, false).step).toBe(8); // F5, the top line
		expect(spellNote(63, true).step).toBe(0); // E♭4 shares E's line
		expect(spellNote(48, false).step).toBe(-9); // C3
	});
	it("spells a chord ascending without repeats", () => {
		expect(spellChord([67, 60, 64, 60], true).map((n) => n.name)).toEqual(["C", "E", "G"]);
		expect(spellChord([60, 64, 67, 70], true).map((n) => n.name)).toEqual(["C", "E", "G", "B♭"]);
	});
});
