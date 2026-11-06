import { dev } from "$app/env";
import * as Sentry from "@sentry/sveltekit";
import { SENTRY_DSN } from "#lib/constants/sentryDsn.js";

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

export const handleError = Sentry.handleErrorWithSentry();
