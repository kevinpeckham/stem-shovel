/**
 * Runs `work` again after a failure that looks like the network (a fetch
 * that never got an answer: a dropped connection, a TLS record the browser
 * refused, a proxy hiccup), waiting `delaysMs[i]` before attempt i + 1; an
 * error that is an answer (a 4xx, a refused type) is thrown at once. Kevin's
 * batch of 32 stems lost its first five to `ERR_SSL_BAD_RECORD_MAC_ALERT`
 * on the multipart create call with no retry (docs/uploads-and-blob.md,
 * "Retries").
 */
export async function withRetries<T>(
	work: (attempt: number) => Promise<T>,
	delaysMs: number[] = [1000, 3000],
	retryable: (e: unknown) => boolean = looksLikeNetwork,
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await work(attempt);
		} catch (e) {
			if (attempt >= delaysMs.length || !retryable(e)) throw e;
			await new Promise((r) => setTimeout(r, delaysMs[attempt]));
		}
	}
}

/** A failure with no HTTP answer behind it: fetch's TypeError, or the Blob client's wording for one. */
export function looksLikeNetwork(e: unknown): boolean {
	if (e instanceof TypeError) return true;
	const message = e instanceof Error ? e.message : String(e);
	return /failed to fetch|network|load failed|ECONNRESET|socket|TLS|SSL|timed? ?out/i.test(message);
}
