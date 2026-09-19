import { redisConfigured, redisPipeline } from "$lib/server/redis";

/**
 * N events per key per window for endpoints that cost money, send mail or
 * guard a secret; the keys are a user id, an email or a client address.
 *
 * With Redis configured (docs/environment.md) the count is shared by every
 * function instance, so the limit is exact: a fixed window keyed by the
 * window's number, `INCR` plus an expiry set on the first hit. Without it,
 * or when Redis fails, a sliding window in this process's memory bounds
 * abuse per instance instead (and says so once in the log).
 */
export async function rateLimited(
	key: string,
	max: number,
	windowMs: number,
	now = Date.now(),
): Promise<boolean> {
	if (redisConfigured()) {
		try {
			const bucket = `rl:${key}:${Math.floor(now / windowMs)}`;
			const [count] = await redisPipeline([
				["INCR", bucket],
				["PEXPIRE", bucket, windowMs, "NX"],
			]);
			return Number(count) > max;
		} catch (e) {
			warnOnce(e);
		}
	}
	return rateLimitedInMemory(key, max, windowMs, now);
}

const windows = new Map<string, number[]>();

/** The in-process sliding window: the fallback, and all there is without Redis. */
export function rateLimitedInMemory(
	key: string,
	max: number,
	windowMs: number,
	now = Date.now(),
): boolean {
	const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
	if (recent.length >= max) {
		windows.set(key, recent);
		return true;
	}
	recent.push(now);
	windows.set(key, recent);
	// Keep the map from growing without bound between calls for the same keys.
	if (windows.size > 10_000) windows.clear();
	return false;
}

let warned = false;
function warnOnce(e: unknown) {
	if (warned) return;
	warned = true;
	console.warn(
		"[rateLimit] Redis unavailable, counting in memory:",
		e instanceof Error ? e.message : e,
	);
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
