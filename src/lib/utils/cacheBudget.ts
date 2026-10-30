/**
 * The bytes a disk cache may keep in this browser (workers/pcmCache.worker.ts,
 * workers/mediaCache.worker.ts): its own limit, or half the site's quota
 * when that is less, so a cache never crowds out the rest of the site's
 * storage. An unknown quota (0) leaves the limit.
 */
export function cacheBudget(limit: number, quota: number): number {
	return quota > 0 ? Math.min(limit, quota / 2) : limit;
}
