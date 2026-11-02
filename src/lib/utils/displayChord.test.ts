import { describe, expect, it } from "vite-plus/test";
import { displayChord } from "./displayChord";

describe("displayChord", () => {
	it("spells a chord as barmark does, with ♯ and ♭", () => {
		expect(displayChord("C")).toBe("C");
		expect(displayChord("D/F#")).toBe("D/F♯");
		expect(displayChord("Bbm7(b5)")).toBe("B♭m7(♭5)");
		expect(displayChord("Bm7♭5")).toBe("Bm7(♭5)");
		expect(displayChord("G7b9")).toBe("G7(♭9)");
		expect(displayChord("Cadd9")).toBe("C(9)");
		expect(displayChord("Am(add9)")).toBe("Am(9)");
		expect(displayChord("C6/9")).toBe("C6/9");
		expect(displayChord("F♯m7")).toBe("F♯m7");
		expect(displayChord("CmMaj7")).toBe("CmMaj7");
	});
	it("shows diminished as ° and augmented as +", () => {
		expect(displayChord("Bdim")).toBe("B°");
		expect(displayChord("B°7")).toBe("B°7");
		expect(displayChord("C+")).toBe("C+");
		expect(displayChord("Caug7")).toBe("C+7");
	});
	it("respells sharp roots and basses as flats on request", () => {
		expect(displayChord("C#m7/G#", { flats: true })).toBe("D♭m7/A♭");
		expect(displayChord("C#m7/G#")).toBe("C♯m7/G♯");
		expect(displayChord("Bbmaj7", { flats: true })).toBe("B♭maj7");
		expect(displayChord("A#7(#9)", { flats: true })).toBe("B♭7(♯9)");
	});
	it("returns what barmark cannot read unchanged", () => {
		expect(displayChord("N.C.")).toBe("N.C.");
		expect(displayChord("a fifth")).toBe("a fifth");
		expect(displayChord("")).toBe("");
	});
});
