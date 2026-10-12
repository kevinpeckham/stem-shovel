import { describe, expect, it } from "vite-plus/test";
import { lcsMatch, mergeThreeWay } from "./mergeThreeWay";

const base = ["# Looper", "", "Intro.", "", "## Inputs", "", "The mic and the line in.", ""].join(
	"\n",
);

describe("mergeThreeWay", () => {
	it("matches lines by the longest common subsequence", () => {
		const m = lcsMatch(["a", "b", "c"], ["a", "x", "c"]);
		expect([...m]).toEqual([
			[0, 0],
			[2, 2],
		]);
	});
	it("a change on one side alone is taken; the other side's text stays", () => {
		const ours = base.replace("Intro.", "Intro, edited in the app.");
		const theirs = base + "\n## The Practice Amp\n\nAmp is a source.\n";
		const r = mergeThreeWay(base, ours, theirs);
		expect(r.conflicts).toEqual([]);
		expect(r.text).toContain("Intro, edited in the app.");
		expect(r.text).toContain("## The Practice Amp");
		expect(r.added).toBe(4);
		expect(r.removed).toBe(0);
	});
	it("both sides unchanged, or the same change on both, merges to itself", () => {
		expect(mergeThreeWay(base, base, base).text).toBe(base);
		const both = base.replace("Intro.", "Intro!");
		expect(mergeThreeWay(base, both, both).text).toBe(both);
	});
	it("a line removed on one side and kept on the other goes", () => {
		const theirs = base.replace("The mic and the line in.\n", "");
		const r = mergeThreeWay(base, base, theirs);
		expect(r.text).not.toContain("The mic and the line in.");
		expect(r.removed).toBe(1);
	});
	it("the same lines changed differently on both sides are a conflict with markers", () => {
		const ours = base.replace("Intro.", "Intro, Kevin's way.");
		const theirs = base.replace("Intro.", "Intro, the seed's way.");
		const r = mergeThreeWay(base, ours, theirs, { ours: "live", theirs: "seed" });
		expect(r.conflicts).toHaveLength(1);
		expect(r.conflicts[0]).toEqual({
			base: ["Intro."],
			ours: ["Intro, Kevin's way."],
			theirs: ["Intro, the seed's way."],
		});
		expect(r.text).toContain(
			"<<<<<<< live\nIntro, Kevin's way.\n=======\nIntro, the seed's way.\n>>>>>>> seed",
		);
		// The rest of the page is still merged around the conflict.
		expect(r.text).toContain("## Inputs");
	});
	it("an edit beside an addition in the same region merges when the base lines survive", () => {
		// Ours rewrote the inputs sentence; theirs appended a paragraph after it: the anchors are the heading and the blank lines.
		const ours = base.replace("The mic and the line in.", "The microphone and a line in.");
		const theirs = base.replace(
			"The mic and the line in.\n",
			"The mic and the line in.\n\nAmp is a source too.\n",
		);
		const r = mergeThreeWay(base, ours, theirs);
		expect(r.conflicts).toEqual([]);
		expect(r.text).toContain("The microphone and a line in.");
		expect(r.text).toContain("Amp is a source too.");
	});
});
