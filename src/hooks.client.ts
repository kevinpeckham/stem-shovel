import { dev } from "$app/env";
import { navigating, page, updated } from "$app/state";
import * as Sentry from "@sentry/sveltekit";
import type { HandleClientError } from "@sveltejs/kit/hooks";
import { SENTRY_DSN } from "#lib/constants/sentryDsn.js";
import { isChunkLoadError } from "#lib/utils/isChunkLoadError.js";
import { hmrFailedModule, isViteHmrFailure } from "#lib/utils/isViteHmrFailure.js";
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
	beforeSend: (event) => (dev && isViteHmrFailure(event) ? recordHmrFailure(event) : event),
});

/**
 * In development, a hot update Vite could not apply (the edited file has a
 * syntax error or a bad import, or the dev server restarted mid-update) makes
 * the component's HMR accept handler read `default` of the module Vite failed
 * to import: an unhandled rejection from Vite's client, not the app
 * (STEM-SHOVEL-1A). It is harmless: Vite already reports the real error in the
 * terminal and its overlay, and the next good save or a reload recovers. So it
 * is left as a breadcrumb, naming the module, on whatever is reported next.
 */
function recordHmrFailure(event: Sentry.ErrorEvent): null {
	const exception = event.exception?.values?.[0];
	Sentry.addBreadcrumb({
		category: "sveltekit.dev-hmr",
		level: "warning",
		message: `Hot update of ${hmrFailedModule(event) ?? "a module"} failed`,
		data: { error: `${exception?.type ?? "Error"}: ${exception?.value ?? ""}` },
	});
	return null;
}

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
	if (dev && isChunkLoadError(input.error) && reloadForDevModule(input.error)) return;
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

/** Where the last dev reload for a module that would not load was recorded, and when. */
const DEV_RELOAD_KEY = "stem-shovel:dev-module-reload";
/** A module still failing this soon after its reload is a real fault, not a stale URL. */
const DEV_RELOAD_WINDOW_MS = 10_000;

/**
 * The dev server's module URLs (.svelte-kit/generated/dev/..., ?t=) change on
 * every HMR update and restart, and an open tab that asks for one it has
 * dropped gets this error. version polling is off in dev, so updated.check()
 * can never answer it; a reload fetches the current modules and the page
 * recovers, so the failure is harmless and left as a breadcrumb. The same
 * module failing again right after its reload is reported.
 */
function reloadForDevModule(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const module = message.match(/https?:\/\/\S+/)?.[0]?.split("?")[0] ?? message;
	try {
		const last = JSON.parse(sessionStorage.getItem(DEV_RELOAD_KEY) ?? "null") as {
			module: string;
			at: number;
		} | null;
		if (last?.module === module && Date.now() - last.at < DEV_RELOAD_WINDOW_MS) {
			sessionStorage.removeItem(DEV_RELOAD_KEY);
			return false;
		}
		sessionStorage.setItem(DEV_RELOAD_KEY, JSON.stringify({ module, at: Date.now() }));
	} catch {
		return false;
	}
	Sentry.addBreadcrumb({
		category: "sveltekit.dev-module",
		level: "warning",
		message: `Dev module ${module} would not load; reloading`,
		data: { error: message },
	});
	location.reload();
	return true;
}

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
