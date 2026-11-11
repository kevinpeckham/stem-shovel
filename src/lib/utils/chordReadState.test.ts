import { describe, expect, it } from "vite-plus/test";
import { chordReadState } from "./chordReadState";

const NOW = 1_000_000;
const STALE = 600_000;

describe("chordReadState", () => {
	it("done when the chords and the beats were read from the current mix", () => {
		expect(
			chordReadState(
				{ chordsKey: "m1", beatsKey: "m1", mixKey: "m1", chordsStartedAt: new Date(NOW) },
				NOW,
				STALE,
			),
		).toBe("done");
	});
	it("reading while the claim is fresh", () => {
		expect(
			chordReadState(
				{ chordsKey: null, beatsKey: null, mixKey: "m1", chordsStartedAt: new Date(NOW - 5000) },
				NOW,
				STALE,
			),
		).toBe("reading");
	});
	it("waiting with no claim, a stale claim, or chords from an older mix", () => {
		expect(
			chordReadState(
				{ chordsKey: null, beatsKey: null, mixKey: "m1", chordsStartedAt: null },
				NOW,
				STALE,
			),
		).toBe("waiting");
		expect(
			chordReadState(
				{
					chordsKey: "m0",
					beatsKey: "m0",
					mixKey: "m1",
					chordsStartedAt: new Date(NOW - STALE - 1),
				},
				NOW,
				STALE,
			),
		).toBe("waiting");
	});
	it("a null mix key never counts as read", () => {
		expect(
			chordReadState(
				{ chordsKey: null, beatsKey: null, mixKey: null, chordsStartedAt: null },
				NOW,
				STALE,
			),
		).toBe("waiting");
	});
	it("chords from the current mix without its beats are not done", () => {
		expect(
			chordReadState(
				{ chordsKey: "m1", beatsKey: null, mixKey: "m1", chordsStartedAt: null },
				NOW,
				STALE,
			),
		).toBe("waiting");
		expect(
			chordReadState(
				{ chordsKey: "m1", beatsKey: "m0", mixKey: "m1", chordsStartedAt: new Date(NOW - 5000) },
				NOW,
				STALE,
			),
		).toBe("reading");
	});
	it("beats from the current mix without its chords are not done", () => {
		expect(
			chordReadState(
				{ chordsKey: null, beatsKey: "m1", mixKey: "m1", chordsStartedAt: null },
				NOW,
				STALE,
			),
		).toBe("waiting");
	});
});
