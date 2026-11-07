import { describe, expect, test } from "vite-plus/test";
import { barmarkKey } from "./barmarkKey";

describe("barmarkKey", () => {
	test("the detector's names, the AI's and a person's read as barmark writes a key", () => {
		expect(barmarkKey("E♭ major")).toBe("Eb");
		expect(barmarkKey("C♯ minor")).toBe("C#m");
		expect(barmarkKey("A minor")).toBe("Am");
		expect(barmarkKey("D major")).toBe("D");
		expect(barmarkKey("F#m")).toBe("F#m");
		expect(barmarkKey("Bb Maj")).toBe("Bb");
		expect(barmarkKey("A mixolydian")).toBe("A mixolydian");
	});
	test("a key is spelled with the fewest accidentals", () => {
		expect(barmarkKey("G# major")).toBe("Ab");
	});
	test("text that is not a key comes back as written", () => {
		expect(barmarkKey("atonal")).toBe("atonal");
		expect(barmarkKey("")).toBe("");
	});
});
