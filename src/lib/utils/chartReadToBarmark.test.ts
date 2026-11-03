import { describe, expect, it } from "vite-plus/test";
import { chartReadToBarmark } from "./chartReadToBarmark.js";

const converted = (summary: string) => {
	const result = chartReadToBarmark(summary);
	if (!result.ok) throw new Error(result.reason);
	return result;
};

describe("chartReadToBarmark", () => {
	it("a repeat with two endings: directives, the opening repeat, an ending line each, prose kept", () => {
		const summary = `Title: Song
Part: Lead sheet
m1 key D major 4/4 tempo 100 |: [A]: D
m2: G
m3 ending 1: A
m4 :|: A7
m5 ending 2: Bm
m6: G`;
		expect(converted(summary)).toEqual({
			ok: true,
			directionsAsWords: false,
			text: `Title: Song
Part: Lead sheet
key: D, time: 4/4, tempo: 100
|: @A | D | G |
|1 A | A7 :|
|2 Bm | G |`,
		});
	});

	it("a :| with no |: opens where the old reader went back to: the start, then the bar after the last :|", () => {
		const summary = "m1 tempo 90 4/4: C\nm2 :|: G\nm3: F\nm4 :|: C";
		expect(converted(summary).text).toBe("time: 4/4, tempo: 90\n|: C | G :|\n|: F | C :|");
	});

	it("a measure left out, or with no chords, holds: the written numbers stay the old measure numbers", () => {
		const summary = 'm1 key G major 3/4 tempo 120: G\nm2 "rit.":\nm5: C';
		expect(converted(summary).text).toBe(
			'key: G, time: 3/4, tempo: 120\n| G | "rit." / | / | / |\n| C |',
		);
	});

	it("a change of key, meter or tempo is a directive line before its measure; a mark not a label is words", () => {
		const summary = `m1 key E♭ major 3/4 tempo 96 [A Verse]: E♭ B♭/D
m2: Cm7
m3 key C minor 4/4 tempo 120 "Chorus": Fm7
Note: page 3 is unreadable`;
		expect(converted(summary).text).toBe(`key: Eb, time: 3/4, tempo: 96
| "A Verse" E♭ B♭/D | Cm7 |
key: Cm, time: 4/4, tempo: 120
| "Chorus" Fm7 |
Note: page 3 is unreadable`);
	});

	it("the first tempo and meter start the chart, as the old reader took them; a key only from its measure", () => {
		const summary = "m1: C\nm2 key F major 3/4 tempo 80: F";
		expect(converted(summary).text).toBe("time: 3/4, tempo: 80\n| C |\nkey: F\n| F |");
	});

	it("a direction barmark would follow stays words: the old reader played straight through", () => {
		const summary = `m1 key C major 4/4 tempo 100 "Segno": C
m2: F
m3 "D.S. al Fine": G`;
		const result = converted(summary);
		expect(result.directionsAsWords).toBe(true);
		expect(result.text).toBe('key: C, time: 4/4, tempo: 100\n| "Segno" C | F | "D.S. al Fine" G |');
	});

	it("a long run wraps at four bars a line; a first ending is one line to its :|", () => {
		const summary =
			"m1 tempo 100: C\nm2: D\nm3: E\nm4: F\nm5: G\nm6 |:: A\nm7 ending 1: B\nm8: C\nm9: D\nm10: E\nm11 :|: F\nm12 ending 2: G";
		expect(converted(summary).text).toBe(
			"tempo: 100\n| C | D | E | F |\n| G |\n|: A |\n|1 B | C | D | E | F :|\n|2 G |",
		);
	});

	it("refuses rather than guesses", () => {
		expect(chartReadToBarmark("Title: Song\nPart: Piano")).toEqual({
			ok: false,
			reason: "no measure lines",
		});
		// A chord barmark cannot read.
		expect(chartReadToBarmark("m1 tempo 100: C Xq7")).toEqual({
			ok: false,
			reason: "the barmark text has an error: Line 2: Xq7: a chord starts with a root A–G (Xq7)",
		});
		// A hold with nothing before it: the old reader kept the "/" as a chord.
		expect(chartReadToBarmark("m1 tempo 100: / C")).toMatchObject({ ok: false });
		// A slash inside the chords: barmark holds where the old reader named a chord "/".
		expect(chartReadToBarmark("m1 tempo 100: C / G /")).toMatchObject({
			ok: false,
			reason: expect.stringMatching(
				/^bar 1 plays measure 1: C C G G .* where the old read plays measure 1: C \/ G \//,
			),
		});
	});
});
