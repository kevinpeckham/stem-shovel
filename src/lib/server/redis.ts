import { ENV } from "varlock/env";

/**
 * Upstash Redis over its REST API (one per stage, `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN` in the stage's 1Password environment): shared state
 * across function instances for the rate limits (src/lib/server/rateLimit.ts)
 * and Better Auth's. No client library: a pipeline is one POST. Unconfigured
 * (a fresh checkout, the tests) means callers fall back to process memory.
 */
export function redisConfigured(): boolean {
	return !!(ENV.KV_REST_API_URL && ENV.KV_REST_API_TOKEN);
}

type Reply = { result?: unknown; error?: string };

/** Runs the commands in order on one connection; answers their results in order. Throws on any error. */
export async function redisPipeline(commands: (string | number)[][]): Promise<unknown[]> {
	const url = ENV.KV_REST_API_URL;
	const token = ENV.KV_REST_API_TOKEN;
	if (!url || !token) throw new Error("Redis is not configured");
	const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify(commands),
		signal: AbortSignal.timeout(2000),
	});
	if (!res.ok) throw new Error(`Redis answered ${res.status}`);
	const replies = (await res.json()) as Reply[];
	return replies.map((r) => {
		if (r.error) throw new Error(`Redis: ${r.error}`);
		return r.result;
	});
}
