import { describe, expect, it } from "vite-plus/test";
import { stripMarkdownInline } from "./stripMarkdownInline";

describe("stripMarkdownInline", () => {
	it("keeps a link's text and drops its target", () => {
		expect(stripMarkdownInline("Record over what you have; see [the docs](/docs/studio).")).toBe(
			"Record over what you have; see the docs.",
		);
	});
	it("drops emphasis and code marks", () => {
		expect(stripMarkdownInline("A **bold** word, an _odd_ one and `code`")).toBe(
			"A bold word, an odd one and code",
		);
	});
	it("leaves plain text alone", () => {
		expect(stripMarkdownInline("Just a sentence.")).toBe("Just a sentence.");
	});
});
