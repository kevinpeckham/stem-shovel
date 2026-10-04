import { describe, expect, it } from "vite-plus/test";
import { chordFromKey } from "./chordFromKey";

describe("chordFromKey", () => {
	it("stacks thirds up the key's scale", () => {
		const c = { root: 0, mode: "major" as const };
		expect(chordFromKey(60, c)).toEqual([60, 64, 67]);
		expect(chordFromKey(62, c)).toEqual([62, 65, 69]);
		expect(chordFromKey(71, c)).toEqual([71, 74, 77]);
		expect(chordFromKey(67, c)).toEqual([67, 71, 74]);
	});
	it("gives a note outside the scale, or with no key, a major triad", () => {
		expect(chordFromKey(61, { root: 0, mode: "major" })).toEqual([61, 65, 68]);
		expect(chordFromKey(69, null)).toEqual([69, 73, 76]);
	});
});
