import { describe, expect, test } from "vite-plus/test";
import type { AlignedPlacements } from "./alignedPlacements.js";
import { sectionsFromPlacements } from "./sectionsFromPlacements.js";

const placements = (over: Partial<AlignedPlacements> = {}): AlignedPlacements => ({
	sections: [
		{ name: "Intro", start: 0, hedged: true },
		{ name: "Verse", start: 4.4, hedged: false },
		{ name: "Chorus", start: 8.4, hedged: false },
		{ name: "Outro", start: 12, hedged: true },
	],
	keyChanges: [],
	tempoChanges: [],
	ratio: 10,
	samePiece: true,
	...over,
});

const BASE =
	"Placed by aligning the chart to the recording; the first and last boundaries are approximate.";

describe("sectionsFromPlacements", () => {
	test("null when the chart marks no sections", () => {
		expect(sectionsFromPlacements(placements({ sections: [] }), [])).toBeNull();
	});

	test("each section at its aligned start, with the approximate-edges note", () => {
		expect(sectionsFromPlacements(placements(), [])).toEqual({
			sections: [
				{ at: 0, name: "Intro" },
				{ at: 4.4, name: "Verse" },
				{ at: 8.4, name: "Chorus" },
				{ at: 12, name: "Outro" },
			],
			notes: BASE,
		});
	});

	test("counts the hedged sections between the first and last", () => {
		const p = placements();
		p.sections[1]!.hedged = true;
		expect(sectionsFromPlacements(p, [])?.notes).toBe(
			"Placed by aligning the chart to the recording; the first and last boundaries are approximate, and 1 more is uncertain.",
		);
		p.sections[2]!.hedged = true;
		expect(sectionsFromPlacements(p, [])?.notes).toContain(", and 2 more are uncertain.");
	});

	test("says when the chart does not match the recording", () => {
		const p = placements({ samePiece: false, ratio: 1.2 });
		for (const s of p.sections) s.hedged = true;
		expect(sectionsFromPlacements(p, [])?.notes).toBe(
			"Placed by aligning the chart to the recording; the first and last boundaries are approximate, and 2 more are uncertain. The chart does not seem to match this recording.",
		);
	});

	test("adds the first parser warning only", () => {
		expect(sectionsFromPlacements(placements(), ["Bar 3 has no chord.", "Bar 9 too."])?.notes).toBe(
			`${BASE} Bar 3 has no chord.`,
		);
	});

	test("a single section is both first and last", () => {
		const p = placements({ sections: [{ name: "Verse", start: 0, hedged: true }] });
		expect(sectionsFromPlacements(p, [])).toEqual({
			sections: [{ at: 0, name: "Verse" }],
			notes: BASE,
		});
	});
});
