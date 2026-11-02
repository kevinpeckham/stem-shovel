import { describe, expect, test } from "vite-plus/test";
import { IdeaDocsState } from "./ideaDocs.svelte.js";

describe("IdeaDocsState", () => {
	test("seeds both documents from an idea, or empties them, bumping the key", () => {
		const docs = new IdeaDocsState();
		docs.seed({ notes: "Lyrics", chart: "| G |" });
		expect([docs.notes, docs.chart, docs.key]).toEqual(["Lyrics", "| G |", 1]);
		docs.seed();
		expect([docs.notes, docs.chart, docs.key]).toEqual(["", "", 2]);
	});
	test("empties only the shown document and names it", () => {
		const docs = new IdeaDocsState();
		docs.seed({ notes: "Lyrics", chart: "| G |" });
		docs.doc = "chart";
		expect(docs.empty()).toBe("chart");
		expect([docs.notes, docs.chart, docs.key]).toEqual(["Lyrics", "", 2]);
	});
	test("titles the panel by the shown document", () => {
		const docs = new IdeaDocsState();
		expect(docs.title("Riff")).toBe("Notes for “Riff”");
		docs.doc = "chart";
		expect(docs.title("Riff")).toBe("Chart for “Riff”");
	});
});
