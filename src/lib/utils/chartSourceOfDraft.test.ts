import { describe, expect, test } from "vite-plus/test";
import type { ChartDraft } from "#lib/state/songChordDraft.svelte.js";
import { chartSourceOfDraft } from "./chartSourceOfDraft";

const AT = "2026-11-10T12:00:00.000Z";
const draft = (extra: Partial<ChartDraft> = {}): ChartDraft => ({
	chords: "",
	sections: [],
	progressions: [],
	chart: "| C |",
	notes: "",
	chartHtml: "",
	...extra,
});

describe("chartSourceOfDraft", () => {
	test("a draft from the stems, the AI's or the built one, is the stems'", () => {
		expect(chartSourceOfDraft(draft(), AT)).toEqual({ kind: "stems", at: AT });
		expect(chartSourceOfDraft(draft({ source: "built" }), AT)).toEqual({ kind: "stems", at: AT });
	});
	test("a score's draft names its file and the file's name", () => {
		const scoreFile = { kind: "file" as const, id: "f1" };
		expect(
			chartSourceOfDraft(draft({ source: "score", scoreName: "Lead sheet", scoreFile }), AT),
		).toEqual({ kind: "file", id: "f1", name: "Lead sheet", at: AT });
	});
	test("a score's draft without a file has no source", () => {
		expect(chartSourceOfDraft(draft({ source: "score", scoreName: "x" }), AT)).toBeUndefined();
	});
});
