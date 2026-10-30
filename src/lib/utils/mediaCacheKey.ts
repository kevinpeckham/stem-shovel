import { isMediaCacheKey } from "./isMediaCacheKey.js";
/**
 * The disk-cache key for a stem's playback rendition (audio/mediaCache.ts):
 * the last segment of the URL's path without its extension, so
 * `accounts/<a>/songs/<s>/<stemId>.play-<stamp>.m4a` keys as
 * `<stemId>.play-<stamp>` (utils/isMediaCacheKey.ts says what a key may be). A rendition's pathname is never reused (Blob
 * pathnames are ID-based), and the query string a private song's presigned
 * URL carries changes on every load (docs/stem-streaming.md), so the
 * pathname alone names the bytes. Null when the URL does not parse or the
 * name is not a key the worker accepts.
 */
export function mediaCacheKey(url: string): string | null {
	let pathname: string;
	try {
		const base =
			typeof location !== "undefined" && location.origin && location.origin !== "null"
				? location.origin
				: "http://localhost";
		pathname = new URL(url, base).pathname;
	} catch {
		return null;
	}
	let name: string;
	try {
		name = decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1));
	} catch {
		return null;
	}
	const dot = name.lastIndexOf(".");
	const key = dot > 0 ? name.slice(0, dot) : name;
	return isMediaCacheKey(key) ? key : null;
}
