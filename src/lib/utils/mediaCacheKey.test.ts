import { describe, expect, it } from "vite-plus/test";
import { mediaCacheKey } from "./mediaCacheKey";

/** The rendition cache's key (utils/mediaCacheKey.ts): the file name without its extension, whatever the host or query. */
describe("mediaCacheKey", () => {
	it("keys a rendition by its file name without the extension", () => {
		expect(
			mediaCacheKey(
				"https://x.public.blob.vercel-storage.com/accounts/a1/songs/s1/stem_AbC-play-1730000000000.m4a",
			),
		).toBe("stem_AbC-play-1730000000000");
	});
	it("keys the real rendition name, a dot before 'play' and all (server/transcode.ts)", () => {
		expect(
			mediaCacheKey(
				"https://x.public.blob.vercel-storage.com/accounts/R7q44bgkS7krZBX6dVoic/songs/V3dfR8ggR5eRPyLfgi6g6/liIKVYQWNcVHGNSnYD81h.play-mtz1sw6k.m4a",
			),
		).toBe("liIKVYQWNcVHGNSnYD81h.play-mtz1sw6k");
	});
	it("never names the cache's own files", () => {
		expect(mediaCacheKey("https://blob/a/b/index.json.m4a")).toBeNull();
		expect(mediaCacheKey("https://blob/a/b/x.part.m4a")).toBeNull();
		expect(mediaCacheKey("https://blob/a/b/....m4a")).toBeNull();
	});
	it("ignores the query string a presigned URL carries", () => {
		const a = mediaCacheKey("https://blob/accounts/a/songs/s/st1-play-9.m4a?sig=one&exp=1");
		const b = mediaCacheKey("https://blob/accounts/a/songs/s/st1-play-9.m4a?sig=two&exp=2");
		expect(a).toBe("st1-play-9");
		expect(b).toBe(a);
	});
	it("resolves a relative URL (the test page's static stems)", () => {
		expect(mediaCacheKey("/stems/drums.wav")).toBe("drums");
	});
	it("keeps a name without an extension as it is", () => {
		expect(mediaCacheKey("https://blob/a/b/plain")).toBe("plain");
	});
	it("is null for a name the worker would refuse or a URL that does not parse", () => {
		expect(mediaCacheKey("https://blob/a/b/")).toBeNull();
		expect(mediaCacheKey("https://blob/a/b/has%20space.m4a")).toBeNull();
		expect(mediaCacheKey("https://blob/a/b/index.json.part")).toBeNull();
		expect(mediaCacheKey(`https://blob/a/${"x".repeat(65)}.m4a`)).toBeNull();
		expect(mediaCacheKey("http://[bad")).toBeNull();
	});
});
