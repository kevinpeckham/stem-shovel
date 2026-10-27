import {
	DASHBOARD_MORE,
	type DashboardAction,
	type DashboardLink,
} from "#lib/constants/dashboardLinks.js";

/** The dashboard sidebar's More: the current account's settings join after the inbox, and are left out without an account. */
export function dashboardMore(slug: string | null): (DashboardLink | DashboardAction)[] {
	if (!slug) return DASHBOARD_MORE;
	const at = DASHBOARD_MORE.findIndex((m) => "href" in m && m.href === "/inbox") + 1;
	return [
		...DASHBOARD_MORE.slice(0, at),
		{ label: "Account settings", href: `/${slug}/settings` },
		...DASHBOARD_MORE.slice(at),
	];
}
