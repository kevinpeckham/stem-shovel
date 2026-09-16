/**
 * A small sliding-window limiter for endpoints that cost money or send
 * mail: N events per key per window, in this process's memory. On Vercel
 * that is per function instance, so it bounds abuse rather than counting
 * exactly; the keys are a user id or a client address.
 */
const windows = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
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

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
