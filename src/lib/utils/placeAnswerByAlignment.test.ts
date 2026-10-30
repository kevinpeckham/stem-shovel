import { describe, expect, test } from "vite-plus/test";
import type { AiAnswer } from "#lib/server/aiDetect.js";
import type { AlignedPlacements } from "./alignedPlacements.js";
import { placeAnswerByAlignment } from "./placeAnswerByAlignment.js";

const answer = (over: Partial<AiAnswer> = {}): AiAnswer => ({
	tempo: 100,
	tempoChanges: [{ at: 50, bpm: 120 }],
	meter: "4/4",
	key: "D major",
	keyChanges: [
		{ at: 30, key: "E major" },
		{ at: 70, key: "F major" },
	],
	notes: "",
	...over,
});

const placements = (over: Partial<AlignedPlacements> = {}): AlignedPlacements => ({
	sections: [],
	keyChanges: [{ at: 8.4, key: "E major", hedged: false }],
	tempoChanges: [{ at: 10.4, bpm: 120, hedged: true }],
	ratio: 10,
	samePiece: true,
	...over,
});

describe("placeAnswerByAlignment", () => {
	test("replaces the key and tempo changes with the aligned ones and marks the answer", () => {
		expect(placeAnswerByAlignment(answer(), placements())).toEqual({
			...answer(),
			keyChanges: [{ at: 8.4, key: "E major" }],
			tempoChanges: [{ at: 10.4, bpm: 120 }],
			placedByAlignment: true,
		});
	});

	test("adds no warning when it places, and keeps the answer's own", () => {
		const placed = placeAnswerByAlignment(answer({ warnings: ["Odd read."] }), placements());
		expect(placed.warnings).toEqual(["Odd read."]);
		expect(placeAnswerByAlignment(answer(), placements()).warnings).toBeUndefined();
	});

	test("a chart that marks no changes leaves none", () => {
		const placed = placeAnswerByAlignment(
			answer(),
			placements({ keyChanges: [], tempoChanges: [] }),
		);
		expect(placed.keyChanges).toEqual([]);
		expect(placed.tempoChanges).toEqual([]);
	});

	test("a chart that does not match keeps the model's placement, with a warning", () => {
		const placed = placeAnswerByAlignment(
			answer({ warnings: ["Odd read."] }),
			placements({ samePiece: false, ratio: 1.234 }),
		);
		expect(placed.keyChanges).toEqual(answer().keyChanges);
		expect(placed.tempoChanges).toEqual(answer().tempoChanges);
		expect(placed.placedByAlignment).toBeUndefined();
		expect(placed.warnings).toEqual([
			"Odd read.",
			"The chart does not seem to match this recording (alignment cost ratio 1.2), so the changes keep the model's placement.",
		]);
	});

	test("does not change the answer it is given", () => {
		const a = answer();
		placeAnswerByAlignment(a, placements());
		expect(a).toEqual(answer());
	});
});
