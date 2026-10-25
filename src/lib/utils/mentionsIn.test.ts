import { describe, expect, it } from "vite-plus/test";
import { mentionsIn } from "./mentionsIn";

describe("mentionsIn", () => {
	const people = [
		{ id: "sam", name: "Sam" },
		{ id: "sl", name: "Sam Lee" },
		{ id: "pat", name: "Pat" },
	];
	it("the people whose @Name is in the body, each once, in the order named; the longest name wins", () => {
		expect(mentionsIn("@Pat, @Sam Lee and @Pat again", people)).toEqual(["pat", "sl"]);
		expect(mentionsIn("@Sam Lee and @Sam", people)).toEqual(["sl", "sam"]);
	});
	it("a name deleted from the body, run on into a word, or never picked is no mention", () => {
		expect(mentionsIn("just Sam, @Samuel, @Kim", people)).toEqual([]);
		expect(mentionsIn("@Pat", [])).toEqual([]);
	});
});
