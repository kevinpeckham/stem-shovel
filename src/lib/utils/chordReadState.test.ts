import { describe, expect, it } from "vite-plus/test";
import { chordReadState } from "./chordReadState";

const NOW = 1_000_000;
const STALE = 600_000;

describe("chordReadState", () => {
	it("done when the chords were read from the current mix", () => {
		expect(
			chordReadState({ chordsKey: "m1", mixKey: "m1", chordsStartedAt: new Date(NOW) }, NOW, STALE),
		).toBe("done");
	});
	it("reading while the claim is fresh", () => {
		expect(
			chordReadState(
				{ chordsKey: null, mixKey: "m1", chordsStartedAt: new Date(NOW - 5000) },
				NOW,
				STALE,
			),
		).toBe("reading");
	});
	it("waiting with no claim, a stale claim, or chords from an older mix", () => {
		expect(
			chordReadState({ chordsKey: null, mixKey: "m1", chordsStartedAt: null }, NOW, STALE),
		).toBe("waiting");
		expect(
			chordReadState(
				{ chordsKey: "m0", mixKey: "m1", chordsStartedAt: new Date(NOW - STALE - 1) },
				NOW,
				STALE,
			),
		).toBe("waiting");
	});
	it("a null mix key never counts as read", () => {
		expect(
			chordReadState({ chordsKey: null, mixKey: null, chordsStartedAt: null }, NOW, STALE),
		).toBe("waiting");
	});
});
