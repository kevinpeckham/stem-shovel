import { describe, expect, test } from "vite-plus/test";
import { staleAutosaves } from "./staleAutosaves";

const rev = (number: number, name: string | null = null) => ({ id: `r${number}`, number, name });

describe("staleAutosaves", () => {
	test("keeps the newest unnamed revisions and every named one", () => {
		const revisions = [rev(1), rev(2, "Verse done"), rev(3), rev(4), rev(5), rev(6, "Mix")];
		expect(staleAutosaves(revisions, 2)).toEqual(["r3", "r1"]);
	});
	test("nothing to prune inside the limit, whatever the order given", () => {
		expect(staleAutosaves([rev(3), rev(1), rev(2)], 3)).toEqual([]);
		expect(staleAutosaves([], 10)).toEqual([]);
	});
	test("named revisions do not count towards the limit", () => {
		expect(staleAutosaves([rev(1, "a"), rev(2, "b"), rev(3), rev(4)], 1)).toEqual(["r3"]);
	});
});
