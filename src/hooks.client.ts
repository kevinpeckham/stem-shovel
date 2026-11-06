import { dev } from "$app/env";
import { updated } from "$app/state";
import * as Sentry from "@sentry/sveltekit";
import type { HandleClientError } from "@sveltejs/kit/hooks";
import { SENTRY_DSN } from "#lib/constants/sentryDsn.js";
import { isChunkLoadError } from "#lib/utils/isChunkLoadError.js";

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
	return reportError(input);
};
