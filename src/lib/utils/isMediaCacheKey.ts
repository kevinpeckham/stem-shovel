/**
 * Whether a name may be a media cache key or song (workers/mediaCache.worker.ts,
 * utils/mediaCacheKey.ts): a plain OPFS file name of word characters, dots and
 * hyphens, up to 64, never a run of dots alone and never the cache's own files
 * (`index.json`, a `.part` in flight). Dots are allowed because the real
 * renditions are `<stemId>.play-<stamp>.m4a` (server/transcode.ts); the first
 * release refused them and so kept no stem (FINDINGS.md, 2026-10-30). One rule
 * for the page side and the worker, so they cannot disagree again.
 */
const NAME = /^(?!\.+$)[\w.-]{1,64}$/;
const RESERVED = /^index\.json$|\.part$/;

export function isMediaCacheKey(name: string): boolean {
	return NAME.test(name) && !RESERVED.test(name);
}
