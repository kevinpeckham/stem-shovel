import { describe, expect, test } from "vite-plus/test";
import { chartStatedAnswer } from "./chartStatedAnswer.js";

const answer = {
	tempo: 120,
	tempoChanges: [{ at: 60, bpm: 140 }],
	meter: "3/4",
	key: "D major",
	keyChanges: [{ at: 62, key: "F major" }],
	notes: "",
};

describe("chartStatedAnswer", () => {
	test("keeps tempo and meter when the chart's summary states them", () => {
		const out = chartStatedAnswer(answer, "m1 key D major 3/4 tempo 120: D G A\nm9 tempo 140: F");
		expect(out).toEqual(answer);
	});

	test("drops the tempo and its changes when the chart has no tempo mark", () => {
		const out = chartStatedAnswer(answer, "m1 key D major 3/4: D G A");
		expect(out.tempo).toBeNull();
		expect(out.tempoChanges).toEqual([]);
		expect(out.meter).toBe("3/4");
		expect(out.key).toBe("D major");
		expect(out.keyChanges).toEqual(answer.keyChanges);
	});

	test("drops the meter when the chart has no time signature; a slash chord is not one", () => {
		const out = chartStatedAnswer(answer, "m1 key D major tempo 120: D G/B A");
		expect(out.meter).toBeNull();
		expect(out.tempo).toBe(120);
	});

	test("a band's own chart counts when it says the tempo in bpm or marks a time signature", () => {
		const out = chartStatedAnswer(answer, "# Intro\n120 bpm, in 3/4\n| D | G | A |");
		expect(out.tempo).toBe(120);
		expect(out.meter).toBe("3/4");
		const bare = chartStatedAnswer(
			answer,
			"# Intro\n| D | G | A | x2\n# Verse\n| Bm | G | D | A/C# |",
		);
		expect(bare.tempo).toBeNull();
		expect(bare.meter).toBeNull();
	});

	test("without a summary only the keys survive", () => {
		const out = chartStatedAnswer(answer, undefined);
		expect(out).toEqual({ ...answer, tempo: null, tempoChanges: [], meter: null });
	});
});
