import { describe, expect, it } from "vite-plus/test";
import { splitHomeCopy } from "./splitHomeCopy";

describe("splitHomeCopy", () => {
	it("takes the headline, the description, and the sections with their items and paragraphs", () => {
		const r = splitHomeCopy(
			[
				"<!-- a note",
				"to the editor -->",
				"# Stem Shovel is a tool.",
				"",
				"For bands,",
				"with care.",
				"",
				"## Stem Player {#player}",
				"",
				"### Share Stems",
				"",
				"Mute and solo.",
				"",
				"Second paragraph.",
				"",
				"## FAQ {#faq}",
				"",
				"Before the questions.",
				"",
				"### What is it? {#what}",
				"",
				"A web app.",
			].join("\n"),
		);
		expect(r.title).toBe("Stem Shovel is a tool.");
		expect(r.intro).toBe("For bands, with care.");
		expect(r.sections.map((s) => s.id)).toEqual(["player", "faq"]);
		expect(r.sections[0]).toEqual({
			id: "player",
			heading: "Stem Player",
			paragraphs: [],
			items: [
				{
					id: "share-stems",
					heading: "Share Stems",
					paragraphs: ["Mute and solo.", "Second paragraph."],
				},
			],
		});
		expect(r.sections[1].paragraphs).toEqual(["Before the questions."]);
		expect(r.sections[1].items).toEqual([
			{ id: "what", heading: "What is it?", paragraphs: ["A web app."] },
		]);
	});
	it("copes with missing parts: no title, no sections, a ### before any ##", () => {
		expect(splitHomeCopy("")).toEqual({ title: "", intro: "", sections: [] });
		expect(splitHomeCopy("Just words.\n\n### Stray")).toEqual({
			title: "",
			intro: "Just words.",
			sections: [],
		});
		expect(splitHomeCopy("# Only a title")).toEqual({
			title: "Only a title",
			intro: "",
			sections: [],
		});
	});
});
