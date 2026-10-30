import { describe, expect, test } from "vite-plus/test";
import { reconcileChordsMessage } from "./reconcileChordsMessage.js";

describe("reconcileChordsMessage", () => {
	test("the bench's message, bar by bar", () => {
		expect(
			reconcileChordsMessage({
				key: "D major",
				meter: "4/4",
				tempo: "120",
				chords: ["D", ""],
				bars: [{ notes: "D2×1.6@0.8 A3×0.5@0.4" }, { notes: "" }],
			}),
		).toBe(
			[
				"The song: key D major, 4/4, 120 bpm, 2 bars.",
				"Bar 1: detected D; notes: D2×1.6@0.8 A3×0.5@0.4",
				"Bar 2: detected N.C.; notes: (none)",
				"Return the corrected chord for every bar, in order.",
			].join("\n"),
		);
	});
	test("an unknown key says so; a missing meter and tempo are left out", () => {
		expect(
			reconcileChordsMessage({
				key: null,
				meter: null,
				tempo: null,
				chords: ["C"],
				bars: [{ notes: "C3×2@0.9" }],
			}).split("\n")[0],
		).toBe("The song: key unknown, 1 bars.");
	});
});
