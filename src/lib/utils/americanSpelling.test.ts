import { describe, expect, it } from "vite-plus/test";
import { americanize, ukWordsIn } from "./americanSpelling";

describe("americanize", () => {
	it("swaps whole UK words for American ones and keeps their case", () => {
		expect(americanize("Colour the centre grey, then normalise it")).toBe(
			"Color the center gray, then normalize it",
		);
		expect(americanize("COLOURS and Favourites")).toBe("COLORS and Favorites");
	});
	it("leaves other words, and parts of words, alone", () => {
		expect(americanize("the colourist's discoloured greyhound")).toBe(
			"the colourist's discoloured greyhound",
		);
		expect(americanize("a meter of music, a metronome")).toBe("a meter of music, a metronome");
	});
	it("lists what it would change", () => {
		expect(ukWordsIn("centre, Centre and colour")).toEqual(["centre", "Centre", "colour"]);
		expect(ukWordsIn("color")).toEqual([]);
	});
});
