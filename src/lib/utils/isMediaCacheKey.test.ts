import { describe, expect, it } from "vite-plus/test";
import { isMediaCacheKey } from "./isMediaCacheKey";

describe("isMediaCacheKey", () => {
	it("accepts a rendition's name without its extension, dots and all, and a nanoid song", () => {
		expect(isMediaCacheKey("liIKVYQWNcVHGNSnYD81h.play-mtz1sw6k")).toBe(true);
		expect(isMediaCacheKey("V3dfR8ggR5eRPyLfgi6g6")).toBe(true);
		expect(isMediaCacheKey("stem_AbC-play-1730000000000")).toBe(true);
	});
	it("refuses the cache's own files, dot runs, spaces, slashes and the overlong", () => {
		for (const bad of ["index.json", "x.part", ".", "..", "", "has space", "a/b", "x".repeat(65)])
			expect(isMediaCacheKey(bad)).toBe(false);
	});
});
