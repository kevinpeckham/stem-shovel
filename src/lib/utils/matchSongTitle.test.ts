import { describe, expect, test } from "vite-plus/test";
import { matchSongTitle, sameTitle } from "./matchSongTitle";

const songs = [
	{ id: "s1", title: "Interbellum" },
	{ id: "s2", title: "Love Song" },
	{ id: "s3", title: "The Long Road" },
	{ id: "s4", title: "Café Noir" },
	{ id: "s5", title: "Don't Stop" },
	{ id: "s6", title: "Self-Esteem" },
	{ id: "s7", title: "Echo (Live)" },
	{ id: "s8", title: "Twin" },
	{ id: "s9", title: "twin" },
];

describe("matchSongTitle", () => {
	test("an exact title", () => {
		expect(matchSongTitle("Interbellum", songs)).toBe("s1");
	});
	test("case, accents, quotes, punctuation and spacing do not matter", () => {
		expect(matchSongTitle("INTERBELLUM", songs)).toBe("s1");
		expect(matchSongTitle("cafe noir", songs)).toBe("s4");
		expect(matchSongTitle("Dont Stop!", songs)).toBe("s5");
		expect(matchSongTitle("Don’t   stop", songs)).toBe("s5");
		expect(matchSongTitle('"Love Song"', songs)).toBe("s2");
		expect(matchSongTitle("Self Esteem", songs)).toBe("s6");
	});
	test("a leading “the” is ignored on either side", () => {
		expect(matchSongTitle("Long Road", songs)).toBe("s3");
		expect(matchSongTitle("The Interbellum", songs)).toBe("s1");
	});
	test("a trailing parenthetical or dash note is set aside", () => {
		expect(matchSongTitle("Interbellum (acoustic)", songs)).toBe("s1");
		expect(matchSongTitle("Interbellum [capo 2]", songs)).toBe("s1");
		expect(matchSongTitle("Interbellum – key of D", songs)).toBe("s1");
		expect(matchSongTitle("Interbellum - key of D (capo 2)", songs)).toBe("s1");
		expect(matchSongTitle("Interbellum (acoustic) — slow", songs)).toBe("s1");
	});
	test("a title with its own parenthetical still matches whole, or with a note after it", () => {
		expect(matchSongTitle("Echo (live)", songs)).toBe("s7");
		expect(matchSongTitle("Echo (Live) - in E", songs)).toBe("s7");
	});
	test("never on part of a title", () => {
		expect(matchSongTitle("Love", songs)).toBeNull();
		expect(matchSongTitle("Song", songs)).toBeNull();
		expect(matchSongTitle("Interbellum Part 2", songs)).toBeNull();
	});
	test("null when two songs fit equally well, or none, or the line is all punctuation", () => {
		expect(matchSongTitle("Twin", songs)).toBeNull();
		expect(matchSongTitle("Break", songs)).toBeNull();
		expect(matchSongTitle("—", songs)).toBeNull();
		expect(matchSongTitle("Anything", [])).toBeNull();
	});
});

describe("sameTitle", () => {
	test("titles equal once loosely compared", () => {
		expect(sameTitle("the clocks", "Clocks")).toBe(true);
		expect(sameTitle("  Don't Stop!  ", "dont stop")).toBe(true);
		expect(sameTitle("Café", "cafe")).toBe(true);
	});
	test("a line with more than the title is not the title", () => {
		expect(sameTitle("Interbellum (acoustic)", "Interbellum")).toBe(false);
		expect(sameTitle("Love", "Love Song")).toBe(false);
	});
});
