import { describe, expect, test } from "vite-plus/test";
import { flagProfanity } from "./profanity";

describe("flagProfanity", () => {
	test("finds words, once each, whatever the case", () => {
		expect(flagProfanity("This is SHIT. Utter shit, damn it.")).toEqual(["shit", "damn"]);
	});
	test("clean text and lookalikes pass", () => {
		expect(flagProfanity("Please assess the bass stems from Scunthorpe.")).toEqual([]);
		expect(flagProfanity("")).toEqual([]);
	});
});
