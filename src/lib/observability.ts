import { browser, dev } from "$app/env";
import { inject, pageview } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

/**
 * Vercel Web Analytics: page views by route, no cookies and nothing that
 * identifies a person (docs/security.md). The script and its beacons are
 * same-origin (/_vercel/insights/*), so the CSP needs nothing extra in
 * production; dev loads a debug script from Vercel instead.
 *
 * The packages' own `/sveltekit` entries read the removed `$app/stores`
 * (SvelteKit 3), so this is what they did, on the generic entries: inject
 * once on import from the root +layout.ts, and the root layout reports each route from `$app/state`
 * through `trackRoute` (page views to Analytics, the route to Speed Insights).
 */
/** Never report a one-time link: confirmation, manage, invitation and reset tokens ride in paths and query strings, and share/invite codes in queries. */
function scrubUrl(href: string): string {
	const url = new URL(href);
	url.search = "";
	url.pathname = url.pathname.replace(
		/^(\/(?:waitlist\/(?:confirm|manage)|invite))\/[^/]+$/,
		"$1/[token]",
	);
	return url.toString();
}

/** Vercel sets these at build on its own deployments; absent elsewhere. */
const basePath = import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH as string | undefined;
const clientConfig = import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG as string | undefined;

let speedInsights: { setRoute: (route: string | null) => void } | null = null;
if (browser) {
	inject(
		{
			mode: dev ? "development" : "production",
			beforeSend: (event) => ({ ...event, url: scrubUrl(event.url) }),
			basePath,
			disableAutoTrack: true,
			framework: "sveltekit",
		},
		clientConfig,
	);
	// Core Web Vitals per route (dynamic params masked by the route id). In dev it loads a debug script from Vercel and sends nothing.
	speedInsights = injectSpeedInsights(
		{
			beforeSend: (event) => ({ ...event, url: scrubUrl(event.url) }),
			basePath,
			framework: "sveltekit",
		},
		clientConfig,
	);
}

/** The root layout calls this after every navigation (and the first render). */
export function trackRoute(route: string | null, path: string) {
	if (route) pageview({ route, path });
	speedInsights?.setRoute(route);
}
