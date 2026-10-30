import { describe, expect, test } from "vite-plus/test";
import { parseReconciledChords } from "./parseReconciledChords.js";

describe("parseReconciledChords", () => {
	test("reads the JSON after the model's narration, trimmed", () => {
		expect(
			parseReconciledChords('Looking at bar 2…\n{"chords": [" D ", "Bm", "N.C."]}\nDone.', 3),
		).toEqual({ chords: ["D", "Bm", "N.C."], error: null });
	});
	test("caps a symbol at 12 characters", () => {
		expect(parseReconciledChords('{"chords": ["Cmaj7#11b9add13"]}', 1).chords).toEqual([
			"Cmaj7#11b9ad",
		]);
	});
	test("no JSON in the answer", () => {
		expect(parseReconciledChords("I think it is D", 1)).toEqual({
			chords: null,
			error: "no JSON in the answer",
		});
	});
	test("JSON parse failed", () => {
		expect(parseReconciledChords('{"chords": ["D",}', 1)).toEqual({
			chords: null,
			error: "JSON parse failed",
		});
	});
	test("chords is not a string array", () => {
		expect(parseReconciledChords('{"chords": "D A"}', 2).error).toBe(
			"chords is not a string array",
		);
		expect(parseReconciledChords('{"chords": ["D", 4]}', 2).error).toBe(
			"chords is not a string array",
		);
		expect(parseReconciledChords("{}", 2).error).toBe("chords is not a string array");
	});
	test("the wrong number of bars", () => {
		expect(parseReconciledChords('{"chords": ["D", "A"]}', 3)).toEqual({
			chords: null,
			error: "expected 3 bars, got 2",
		});
	});
});
