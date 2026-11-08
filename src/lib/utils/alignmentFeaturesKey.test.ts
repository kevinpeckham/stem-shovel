import { describe, expect, it } from "vite-plus/test";
import { alignmentFeaturesKey } from "./alignmentFeaturesKey";

/** The alignment features' cache key (utils/alignmentFeaturesKey.ts): the version, the rate and the renditions' keys, sorted. */
describe("alignmentFeaturesKey", () => {
	const a = "https://blob/accounts/a/songs/s/stA.play-1.m4a?sig=one";
	const b = "https://blob/accounts/a/songs/s/stB.play-2.m4a";
	it("joins the sorted rendition keys after the version and the rate", () => {
		expect(alignmentFeaturesKey([b, a], 48000)).toBe("af1:48000:stA.play-1,stB.play-2");
		expect(alignmentFeaturesKey([a, b], 48000)).toBe(alignmentFeaturesKey([b, a], 48000));
	});
	it("differs by rate and by the set of renditions", () => {
		expect(alignmentFeaturesKey([a], 44100)).not.toBe(alignmentFeaturesKey([a], 48000));
		expect(alignmentFeaturesKey([a], 48000)).not.toBe(alignmentFeaturesKey([a, b], 48000));
	});
	it("is null with no URLs or any URL without a key", () => {
		expect(alignmentFeaturesKey([], 48000)).toBeNull();
		expect(alignmentFeaturesKey([a, "https://blob/a/b/index.json.m4a"], 48000)).toBeNull();
	});
});
