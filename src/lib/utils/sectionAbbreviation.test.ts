import { describe, expect, test } from "vite-plus/test";
import { sectionAbbreviation } from "./sectionAbbreviation";

describe("sectionAbbreviation", () => {
	test("the usual names, case-insensitively", () => {
		expect(
			[
				"Intro",
				"verse",
				"Pre-chorus",
				"Pre Chorus",
				"PreChorus",
				"CHORUS",
				"Bridge",
				"Solo",
				"Interlude",
				"Breakdown",
				"Outro",
				"Coda",
				"Refrain",
				"Hook",
				"Tag",
				"Vamp",
			].map(sectionAbbreviation),
		).toEqual([
			"In",
			"V",
			"PC",
			"PC",
			"PC",
			"Ch",
			"Br",
			"So",
			"Int",
			"Bd",
			"Out",
			"Co",
			"Ref",
			"Hk",
			"Tag",
			"Vp",
		]);
	});
	test("a trailing number is kept, however it is written", () => {
		expect(sectionAbbreviation("Verse 2")).toBe("V2");
		expect(sectionAbbreviation("Verse - 2")).toBe("V2");
		expect(sectionAbbreviation("Verse2")).toBe("V2");
		expect(sectionAbbreviation("Chorus 12")).toBe("Ch12");
		expect(sectionAbbreviation("Guitar Solo 2")).toBe("GS2");
	});
	test("a leading roman numeral with a separator is dropped", () => {
		expect(sectionAbbreviation("II - Verse")).toBe("V");
		expect(sectionAbbreviation("IV. Bridge")).toBe("Br");
		expect(sectionAbbreviation("III: Chorus 2")).toBe("Ch2");
		expect(sectionAbbreviation("vi – Outro")).toBe("Out");
	});
	test("other names: short ones as written, longer ones by their initials", () => {
		expect(sectionAbbreviation("DAOM")).toBe("DAOM");
		expect(sectionAbbreviation("Jam")).toBe("Jam");
		expect(sectionAbbreviation("Guitar Solo")).toBe("GS");
		expect(sectionAbbreviation("Dicking Around on the Moon")).toBe("DAOM");
		expect(sectionAbbreviation("Out of my head")).toBe("OMH");
		expect(sectionAbbreviation("Turnaround")).toBe("Tur");
		expect(sectionAbbreviation("One Two Three Four Five")).toBe("OTTF");
	});
	test("articles, conjunctions and of count only when nothing else remains", () => {
		expect(sectionAbbreviation("Rock and Roll")).toBe("RR");
		expect(sectionAbbreviation("The End")).toBe("E");
		expect(sectionAbbreviation("and the")).toBe("AT");
		expect(sectionAbbreviation("Back in Black")).toBe("BIB");
	});
	test("empty, blank or a number alone", () => {
		expect(sectionAbbreviation("")).toBe("");
		expect(sectionAbbreviation("   ")).toBe("");
		expect(sectionAbbreviation("2")).toBe("2");
	});
	test("a numeral without a separator is a name, not a prefix", () => {
		expect(sectionAbbreviation("Mix")).toBe("Mix");
		expect(sectionAbbreviation("Vamp")).toBe("Vp");
	});
});
