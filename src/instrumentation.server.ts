import * as Sentry from "@sentry/node";

/**
 * Sentry on the server, loaded before the app (SvelteKit's
 * src/instrumentation.server.ts convention, automatic since SvelteKit 3). Unhandled errors in
 * loads, remote functions and hooks are reported with the route
 * (src/hooks.server.ts); no user identity or request bodies
 * (docs/environment.md). `@sentry/node`, not `@sentry/sveltekit`: the
 * SvelteKit server entry re-exports the Vite plugin and so drags Vite,
 * esbuild and Babel into every cold start. No tracing: errors only.
 */
Sentry.init({
	dsn: "https://d6929e5d1424ced35084d71f487d9aca@o4505247956860928.ingest.us.sentry.io/4512102516457472",
	environment: process.env.VERCEL_ENV ?? "development",
	tracesSampleRate: 0,
	// Sentry 11's per-category switches, all off: no user identity, cookies, headers, bodies or query strings.
	dataCollection: {
		userInfo: false,
		cookies: false,
		httpHeaders: false,
		httpBodies: [],
		urlQueryParams: false,
	},
});
