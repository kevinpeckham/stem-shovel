import { describe, expect, test } from "vite-plus/test";
import { sectionLabels } from "./sectionLabels";

const named = (...names: string[]) => names.map((name) => ({ name }));

describe("sectionLabels", () => {
	test("a recurring name is numbered from its first occurrence; a single one is not", () => {
		expect(
			sectionLabels(named("Intro", "Verse", "Chorus", "Verse", "Chorus", "Bridge", "Outro")),
		).toEqual(["In", "V1", "Ch1", "V2", "Ch2", "Br", "Out"]);
	});
	test("names compare after trimming and case folding", () => {
		expect(sectionLabels(named("Verse", " verse ", "VERSE"))).toEqual(["V1", "V2", "V3"]);
	});
	test("a name with its own number keeps it", () => {
		expect(sectionLabels(named("Verse 1", "Chorus", "Verse 2", "Verse 2"))).toEqual([
			"V1",
			"Ch",
			"V2",
			"V2",
		]);
	});
	test("an empty list, and an empty name", () => {
		expect(sectionLabels([])).toEqual([]);
		expect(sectionLabels(named("", ""))).toEqual(["", ""]);
	});
});
