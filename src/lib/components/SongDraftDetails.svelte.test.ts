import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import SongDraftDetails from "./SongDraftDetails.svelte";

/** A draft's sections line: each section at its bar as the draft's chart writes it. */
const draft = (chart: string, sections: { name: string; bar: number }[]) => ({
	chords: "",
	sections,
	progressions: [],
	notes: "",
	chart,
	chartHtml: "",
});

describe("SongDraftDetails", () => {
	test("a section after a repeat shows its written bar, not its play position", () => {
		const chart = "## Verse\n|: C | G :|\n## Chorus\n| Am | F |";
		render(SongDraftDetails, {
			props: {
				draft: draft(chart, [
					{ name: "Verse", bar: 1 },
					{ name: "Chorus", bar: 5 },
				]),
			},
		});
		expect(screen.getByText("Verse @ bar 1 · Chorus @ bar 3")).toBeInTheDocument();
	});
	test("a chart without repeats reads as it plays", () => {
		render(SongDraftDetails, {
			props: {
				draft: draft("## Verse\n| C | G |\n## Chorus\n| Am | F |", [
					{ name: "Verse", bar: 1 },
					{ name: "Chorus", bar: 3 },
				]),
			},
		});
		expect(screen.getByText("Verse @ bar 1 · Chorus @ bar 3")).toBeInTheDocument();
	});
});
