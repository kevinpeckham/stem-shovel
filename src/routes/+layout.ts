import { dev } from "$app/environment";
import { injectAnalytics } from "@vercel/analytics/sveltekit";

/**
 * Vercel Web Analytics: page views by route, no cookies and nothing that
 * identifies a person (docs/security.md). The script and its beacons are
 * same-origin (/_vercel/insights/*), so the CSP needs nothing extra in
 * production; dev loads a debug script from Vercel instead.
 */
injectAnalytics({
	mode: dev ? "development" : "production",
	// Never report a one-time link: confirmation, manage, invitation and reset
	// tokens ride in paths and query strings, and share/invite codes in queries.
	beforeSend: (event) => {
		const url = new URL(event.url);
		url.search = "";
		url.pathname = url.pathname.replace(
			/^(\/(?:waitlist\/(?:confirm|manage)|invite))\/[^/]+$/,
			"$1/[token]",
		);
		return { ...event, url: url.toString() };
	},
});
