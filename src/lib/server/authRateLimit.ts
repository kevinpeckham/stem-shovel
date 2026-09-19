import { rateLimitedInMemory } from "$lib/server/rateLimit";
import { redisConfigured, redisPipeline } from "$lib/server/redis";

/**
 * Better Auth's rate-limit storage on Redis (src/lib/server/redis.ts), so
 * sign-in, password reset and two-factor attempts are counted across every
 * function instance rather than per instance. The same fixed window as
 * src/lib/server/rateLimit.ts; without Redis, or when it fails, the
 * in-process window stands in.
 */
export const authRateLimitStorage = {
	async consume(key: string, rule: { window: number; max: number }) {
		const windowMs = rule.window * 1000;
		const now = Date.now();
		if (redisConfigured()) {
			try {
				const slot = Math.floor(now / windowMs);
				const bucket = `ba-rl:${key}:${slot}`;
				const [count] = await redisPipeline([
					["INCR", bucket],
					["PEXPIRE", bucket, windowMs, "NX"],
				]);
				const allowed = Number(count) <= rule.max;
				const retryAfter = allowed ? null : Math.ceil(((slot + 1) * windowMs - now) / 1000);
				return { allowed, retryAfter };
			} catch {
				// Redis down: count here rather than refuse or wave through unbounded.
			}
		}
		const limited = rateLimitedInMemory(`ba:${key}`, rule.max, windowMs, now);
		return { allowed: !limited, retryAfter: limited ? rule.window : null };
	},
};
