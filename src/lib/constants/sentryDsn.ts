/**
 * The app's Sentry DSN (docs/environment.md "Sentry"): a public value, the
 * same project for the browser (src/hooks.client.ts), the server
 * (src/instrumentation.server.ts) and the nightly smoke test
 * (scripts/smoke-nightly.mjs), so its check-ins and failures sit with the
 * app's issues. The environment tag keeps them apart.
 */
export const SENTRY_DSN =
	"https://d6929e5d1424ced35084d71f487d9aca@o4505247956860928.ingest.us.sentry.io/4512102516457472";
