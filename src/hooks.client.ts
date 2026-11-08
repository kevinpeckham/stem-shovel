import { dev } from "$app/env";
import { navigating, page, updated } from "$app/state";
import * as Sentry from "@sentry/sveltekit";
import type { HandleClientError } from "@sveltejs/kit/hooks";
import { SENTRY_DSN } from "#lib/constants/sentryDsn.js";
import { isChunkLoadError } from "#lib/utils/isChunkLoadError.js";
import { isNetworkFetchError } from "#lib/utils/isNetworkFetchError.js";

/**
 * Sentry in the browser (docs/environment.md). The DSN is a public value.
 * No user identity or request bodies are sent; errors carry the stack, the
 * route and the browser. Replay records a sample of sessions with text and
 * inputs masked (its default), and every session that hits an error. On in
 * development too; the environment tag keeps it apart.
 */
Sentry.init({
	dsn: SENTRY_DSN,
	// The server tags by VERCEL_ENV; the browser has only its hostname to go on.
	environment: dev
		? "development"
		: location.hostname === "www.stemshovel.com"
			? "production"
			: "preview",
	tracesSampleRate: 0.2,
	replaysSessionSampleRate: 0.1,
	replaysOnErrorSampleRate: 1.0,
	integrations: [Sentry.replayIntegration()],
	dataCollection: { userInfo: false, httpBodies: [] },
});

const reportError: HandleClientError = Sentry.handleErrorWithSentry();

/**
 * Hovering a link preloads its route (app.html), and in a tab older than the
 * last deploy that fetches a chunk that is gone. SvelteKit checks for a new
 * version when a navigation fails this way, and loads the page afresh, but
 * not when a preload does: it hands the error here, though nobody saw it and
 * the click will reload (the root layout's beforeNavigate). A failed chunk with
 * no new version out is a real fault and is still reported.
 */
export const handleError: HandleClientError = async (input) => {
	if (isChunkLoadError(input.error) && (await updated.check())) return;
	if (isNetworkFetchError(input.error) && isPreload(input.event.url)) {
		Sentry.addBreadcrumb({
			category: "sveltekit.preload",
			level: "warning",
			message: `Preload of ${input.event.url.pathname} got no response`,
			data: { url: input.event.url.href, error: String(input.error) },
		});
		return;
	}
	return reportError(input);
};

/**
 * Hovering a link preloads its data (app.html). When that fetch gets no
 * response (the connection dropped, the request was cut off, the machine slept)
 * SvelteKit hands the error here though it then throws the preload away and
 * nobody saw it. It is harmless: the click loads the data afresh, and if that
 * fails it is a navigation, which is still reported. A preload is the one load
 * with no navigation in progress that targets a page other than the current one
 * (an invalidate reloads the current page, and is still reported).
 */
function isPreload(url: URL): boolean {
	return navigating.to === null && url.href !== page.url.href;
}
