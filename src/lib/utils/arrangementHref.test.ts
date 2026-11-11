import { describe, expect, test } from "vite-plus/test";
import { arrangementHref } from "./arrangementHref";

const page = (q = "") => new URL(`https://stem-shovel.test/band/projects/p/song${q}`);

describe("arrangementHref", () => {
	test("Main is the page without the parameter", () => {
		expect(arrangementHref(page("?arrangement=abc"), null)).toBe("/band/projects/p/song");
		expect(arrangementHref(page(), null)).toBe("/band/projects/p/song");
	});

	test("an alternate sets the parameter, replacing another", () => {
		expect(arrangementHref(page(), "abc")).toBe("/band/projects/p/song?arrangement=abc");
		expect(arrangementHref(page("?arrangement=old"), "abc")).toBe(
			"/band/projects/p/song?arrangement=abc",
		);
	});

	test("other parameters stay", () => {
		expect(arrangementHref(page("?share=XYZ&arrangement=old"), null)).toBe(
			"/band/projects/p/song?share=XYZ",
		);
		expect(arrangementHref(page("?share=XYZ"), "abc")).toBe(
			"/band/projects/p/song?share=XYZ&arrangement=abc",
		);
	});
});
