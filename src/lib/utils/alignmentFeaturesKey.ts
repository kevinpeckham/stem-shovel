import { mediaCacheKey } from "./mediaCacheKey.js";

/**
 * The browser cache key for a song's recording features (the chromagram,
 * audible span and onset envelope the chart alignment reads,
 * audio/alignmentFeaturesCache.ts): `af1:<sampleRate>:<keys>`, the keys
 * every source rendition's `mediaCacheKey`, sorted and joined by commas. A
 * rendition's pathname is never reused, so the set names the audio; the
 * rate is the mix's. `af1` is the feature code's version: bump it when
 * `chromagram`, `audibleSpan` or `alignmentEnvelope`
 * (audio/chartAlignment.ts) change what they compute. Null when there are
 * no URLs or any has no key.
 */
export function alignmentFeaturesKey(urls: string[], sampleRate: number): string | null {
	if (urls.length === 0) return null;
	const keys: string[] = [];
	for (const url of urls) {
		const key = mediaCacheKey(url);
		if (key === null) return null;
		keys.push(key);
	}
	return `af1:${sampleRate}:${keys.sort().join(",")}`;
}
