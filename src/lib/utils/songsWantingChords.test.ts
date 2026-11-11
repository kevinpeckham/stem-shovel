import { describe, expect, test } from "vite-plus/test";
import { songsWantingChords } from "./songsWantingChords";

const song = (id: string, over = {}) => ({
	id,
	noAi: false,
	mixUrl: "https://x/mix.mp3",
	mixKey: "k1",
	chordsKey: null as string | null,
	beatsKey: null as string | null,
	chordsStartedAt: null as Date | null,
	...over,
});

describe("songsWantingChords", () => {
	test("the songs with a mix the model or the tracker has not read, in order; none for a no-AI project", () => {
		const songs = [
			song("a"),
			song("b", { chordsKey: "k1", beatsKey: "k1" }),
			song("c", { mixUrl: null, mixKey: null }),
			song("d", { chordsKey: "old" }),
			song("e", { noAi: true }),
			song("f", { chordsKey: "k1" }),
			song("g", { chordsKey: "k1", beatsKey: "old" }),
			song("h", { beatsKey: "k1" }),
		];
		expect(songsWantingChords(songs, { noAi: false })).toEqual(["a", "d", "f", "g", "h"]);
		expect(songsWantingChords(songs, { noAi: true })).toEqual([]);
	});
});
