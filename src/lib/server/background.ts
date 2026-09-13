/**
 * Runs work after the response. On Vercel the request context's `waitUntil`
 * keeps the function alive until the promise settles; anywhere else (the dev
 * server, scripts) the promise simply runs. Errors are logged, never thrown
 * into the request.
 */
export function background(work: () => Promise<void>) {
	const promise = work().catch((e) => console.error("[background]", e));
	const ctx = (
		globalThis as Record<
			symbol,
			{ get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined
		>
	)[Symbol.for("@vercel/request-context")];
	ctx?.get?.()?.waitUntil?.(promise);
}
