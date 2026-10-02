import { describe, expect, it } from "vite-plus/test";
import { splitPageCopy } from "./splitPageCopy";

describe("splitPageCopy", () => {
	it("takes the title, the first paragraph and the rest", () => {
		const r = splitPageCopy(
			"# Looper\n\nLay a loop down\na layer at a time.\n\n## How to use it\n\nPress Record.\n",
		);
		expect(r.title).toBe("Looper");
		expect(r.intro).toBe("Lay a loop down a layer at a time.");
		expect(r.rest).toBe("## How to use it\n\nPress Record.");
	});
	it("copes with missing parts", () => {
		expect(splitPageCopy("")).toEqual({ title: "", intro: "", rest: "" });
		expect(splitPageCopy("Just words.")).toEqual({ title: "", intro: "Just words.", rest: "" });
		expect(splitPageCopy("# Only a title")).toEqual({ title: "Only a title", intro: "", rest: "" });
	});
});
