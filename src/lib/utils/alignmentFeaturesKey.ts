import { FEATURES_VERSION } from "@barmark/listen/features";
import { mediaCacheKey } from "./mediaCacheKey.js";

/**
 * The browser cache key for a song's recording features (@barmark/listen's
 * `Features`, which the chart alignment and the chartless grid read,
 * audio/alignmentFeaturesCache.ts): `lf<version>:<sampleRate>:<keys>`, the
 * version the package's `FEATURES_VERSION` (raised whenever its features
 * come out differently, so an upgrade misses the cache), the keys every
 * source rendition's `mediaCacheKey`, sorted and joined by commas. A
 * rendition's pathname is never reused, so the set names the audio; the
 * rate is the mix's. Null when there are no URLs or any has no key.
 */
export function alignmentFeaturesKey(urls: string[], sampleRate: number): string | null {
	if (urls.length === 0) return null;
	const keys: string[] = [];
	for (const url of urls) {
		const key = mediaCacheKey(url);
		if (key === null) return null;
		keys.push(key);
	}
	return `lf${FEATURES_VERSION}:${sampleRate}:${keys.sort().join(",")}`;
}
