import { reportError } from "#lib/server/reportError.js";

/**
 * Runs work after the response. On Vercel the request context's `waitUntil`
 * keeps the function alive until the promise settles; anywhere else (the dev
 * server, scripts) the promise simply runs. Errors are logged and reported
 * to Sentry (tagged with `context.kind`, "background" when none is given),
 * never thrown into the request.
 */
export function background(work: () => Promise<void>, context?: { kind: string; count?: number }) {
	const promise = work().catch((e) => {
		console.error("[background]", e);
		reportError(e, { job: context?.kind ?? "background" }, { count: context?.count });
	});
	const ctx = (
		globalThis as Record<
			symbol,
			{ get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined
		>
	)[Symbol.for("@vercel/request-context")];
	ctx?.get?.()?.waitUntil?.(promise);
}
