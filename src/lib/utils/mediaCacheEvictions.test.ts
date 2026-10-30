import { describe, expect, it } from "vite-plus/test";
import { mediaCacheEvictions, type MediaCacheEntry } from "./mediaCacheEvictions";

/** The media cache's eviction (utils/mediaCacheEvictions.ts): whole songs, least recently used first, never the one being written. */
const e = (song: string, bytes: number, used: number): MediaCacheEntry => ({ song, bytes, used });

describe("mediaCacheEvictions", () => {
	it("drops nothing while the cache fits", () => {
		expect(mediaCacheEvictions({ a1: e("A", 10, 1), b1: e("B", 10, 2) }, "B", 20)).toEqual([]);
	});
	it("drops whole songs, the least recently used first, until it fits", () => {
		const index = {
			a1: e("A", 10, 5),
			a2: e("A", 10, 1),
			b1: e("B", 10, 3),
			c1: e("C", 10, 9),
		};
		// A's newest file (5) is newer than B's (3): B goes first, then A.
		expect(mediaCacheEvictions(index, "C", 30)).toEqual(["b1"]);
		expect(mediaCacheEvictions(index, "C", 10).sort()).toEqual(["a1", "a2", "b1"]);
	});
	it("never drops the song being written while others can go", () => {
		const index = { a1: e("A", 10, 1), b1: e("B", 10, 2) };
		expect(mediaCacheEvictions(index, "A", 10)).toEqual(["b1"]);
	});
	it("drops the song being written too when it alone is over the budget", () => {
		const index = { a1: e("A", 30, 1), a2: e("A", 30, 2), b1: e("B", 10, 0) };
		expect(mediaCacheEvictions(index, "A", 50).sort()).toEqual(["a1", "a2", "b1"]);
	});
});
