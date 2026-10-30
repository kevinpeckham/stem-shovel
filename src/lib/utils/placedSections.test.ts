import { describe, expect, test } from "vite-plus/test";
import type { AlignedPlacements } from "./alignedPlacements.js";
import { placedSections } from "./placedSections.js";

const placements = (sections: AlignedPlacements["sections"]): AlignedPlacements => ({
	sections,
	keyChanges: [],
	tempoChanges: [],
	ratio: 10,
	samePiece: true,
});

describe("placedSections", () => {
	test("the reason's sentence when the chart could not be aligned", () => {
		expect(placedSections({ reason: "audio" })).toBe(
			"The stems are still decoding; try again when the player is ready.",
		);
	});

	test("says so when the chart marks no sections", () => {
		expect(placedSections({ placements: placements([]), warnings: [] })).toBe(
			"The chart marks no sections",
		);
	});

	test("the sections to offer", () => {
		const placed = placedSections({
			placements: placements([{ name: "Verse", start: 0, hedged: true }]),
			warnings: [],
		});
		expect(placed).toMatchObject({ sections: [{ at: 0, name: "Verse" }] });
	});
});
