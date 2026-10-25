import * as Sentry from "@sentry/node";

/**
 * Reports a server-side failure that no request will see (background work,
 * one id of a job) to Sentry, tagged so the issue says which job it was.
 * The caller logs it too: the dev server's log is where a developer looks
 * first, and Sentry is initialized there with the "development"
 * environment (src/instrumentation.server.ts), as src/hooks.server.ts's
 * `handleError` relies on.
 */
export function reportError(
	e: unknown,
	tags: Record<string, string>,
	extra?: Record<string, unknown>,
): void {
	Sentry.captureException(e, { tags, extra });
}
