import { dev } from "$app/environment";
import { injectAnalytics } from "@vercel/analytics/sveltekit";
import { injectSpeedInsights } from "@vercel/speed-insights/sveltekit";

/**
 * Vercel Web Analytics: page views by route, no cookies and nothing that
 * identifies a person (docs/security.md). The script and its beacons are
 * same-origin (/_vercel/insights/*), so the CSP needs nothing extra in
 * production; dev loads a debug script from Vercel instead.
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

injectAnalytics({
	mode: dev ? "development" : "production",
	beforeSend: (event) => ({ ...event, url: scrubUrl(event.url) }),
});

// Core Web Vitals per route (the /sveltekit entry masks dynamic params). In
// dev it loads a debug script from Vercel and sends nothing.
injectSpeedInsights({ beforeSend: (event) => ({ ...event, url: scrubUrl(event.url) }) });
