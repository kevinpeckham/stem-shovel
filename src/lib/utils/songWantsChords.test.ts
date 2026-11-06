import { describe, expect, test } from "vite-plus/test";
import { songWantsChords } from "./songWantsChords";

const song = (over: Partial<Parameters<typeof songWantsChords>[0]> = {}) => ({
	noAi: false,
	mixUrl: "https://x/mix.mp3",
	mixKey: "abc",
	chordsKey: null,
	chordsStartedAt: null,
	project: { noAi: false },
	...over,
});

describe("songWantsChords", () => {
	test("a song with a mix and no chords wants them", () => {
		expect(songWantsChords(song())).toBe(true);
	});
	test("chords read from the current mix: nothing to do", () => {
		expect(songWantsChords(song({ chordsKey: "abc" }))).toBe(false);
	});
	test("a new mix since the chords were read: again", () => {
		expect(songWantsChords(song({ chordsKey: "old" }))).toBe(true);
	});
	test("no mix yet: nothing to read", () => {
		expect(songWantsChords(song({ mixUrl: null, mixKey: null }))).toBe(false);
	});
	test("no AI for the song or its project", () => {
		expect(songWantsChords(song({ noAi: true }))).toBe(false);
		expect(songWantsChords(song({ project: { noAi: true } }))).toBe(false);
	});
	test("a run claimed a moment ago is left alone; a stale claim is not", () => {
		const now = 1_000_000_000;
		expect(songWantsChords(song({ chordsStartedAt: new Date(now - 1000) }), now)).toBe(false);
		expect(songWantsChords(song({ chordsStartedAt: new Date(now - 11 * 60 * 1000) }), now)).toBe(
			true,
		);
	});
});
