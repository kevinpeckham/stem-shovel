import * as Sentry from "@sentry/sveltekit";

/**
 * Sentry on the server, loaded before the app (SvelteKit's
 * experimental.instrumentation.server, vite.config.ts). Unhandled errors in
 * loads, remote functions and hooks are reported with the route and a
 * trace; no user identity or request bodies (docs/environment.md).
 */
Sentry.init({
	dsn: "https://d6929e5d1424ced35084d71f487d9aca@o4505247956860928.ingest.us.sentry.io/4512102516457472",
	environment: process.env.VERCEL_ENV ?? "development",
	tracesSampleRate: 0.2,
	sendDefaultPii: false,
});
