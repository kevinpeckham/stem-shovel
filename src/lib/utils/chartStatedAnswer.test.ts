import { describe, expect, test } from "vite-plus/test";
import { chartStatedAnswer } from "./chartStatedAnswer.js";

const answer = {
	tempo: 120,
	tempoChanges: [
		{ at: 60, bpm: 140 },
		{ at: 90, bpm: 150 },
	],
	meter: "4/4" as string | null,
	key: "D major",
	keyChanges: [{ at: 62, key: "F major" }],
	notes: "",
};

describe("chartStatedAnswer", () => {
	test("the chart's tempo replaces a wrong one from the model", () => {
		const out = chartStatedAnswer(answer, "m1 key D major 4/4 tempo 96: D G A");
		expect(out.tempo).toBe(96);
		expect(out.meter).toBe("4/4");
		expect(out.tempoChanges).toEqual([]);
		expect(out.key).toBe("D major");
		expect(out.keyChanges).toEqual(answer.keyChanges);
	});

	test("a chord chart with no tempo mark gives no tempo, whatever the model said", () => {
		const out = chartStatedAnswer(answer, "m1 key D major: D G A\nm5: Bm G D A");
		expect(out.tempo).toBeNull();
		expect(out.tempoChanges).toEqual([]);
		expect(out.meter).toBeNull();
	});

	test("the chart's 3/4 beats the model's 4/4", () => {
		expect(chartStatedAnswer(answer, "m1 key D major 3/4 tempo 120: D G A").meter).toBe("3/4");
	});

	test("later tempo marks: the model's placements, trimmed to the chart's count, with the chart's bpm", () => {
		const out = chartStatedAnswer(answer, "m1 key D major 4/4 tempo 100: D G A\nm9 tempo 132: F");
		expect(out.tempo).toBe(100);
		expect(out.tempoChanges).toEqual([{ at: 60, bpm: 132 }]);
		const more = chartStatedAnswer(
			{ ...answer, tempoChanges: [{ at: 60, bpm: 140 }] },
			"m1 tempo 100: D\nm9 tempo 132: F\nm17 tempo 80: D",
		);
		// The model placed one of the two later marks: only that one is kept.
		expect(more.tempoChanges).toEqual([{ at: 60, bpm: 132 }]);
	});

	test("a band's chart that writes ♩ = 132", () => {
		const out = chartStatedAnswer(answer, "♩ = 132\n# Intro\n| D | G | A |");
		expect(out.tempo).toBe(132);
		expect(out.meter).toBeNull();
		expect(out.tempoChanges).toEqual([]);
	});

	test("without a summary only the keys survive", () => {
		const out = chartStatedAnswer(answer, undefined);
		expect(out).toEqual({ ...answer, tempo: null, tempoChanges: [], meter: null });
	});
});
