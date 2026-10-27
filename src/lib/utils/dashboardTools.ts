import { DASHBOARD_TOOLS, type DashboardLink } from "#lib/constants/dashboardLinks.js";

/** The dashboard sidebar's Tools: the Session Recorder for the current account joins after Dawn, and is left out without an account. */
export function dashboardTools(slug: string | null): DashboardLink[] {
	if (!slug) return DASHBOARD_TOOLS;
	const at = DASHBOARD_TOOLS.findIndex((t) => t.href === "/multitrack-recorder") + 1;
	return [
		...DASHBOARD_TOOLS.slice(0, at),
		{ label: "Session Recorder", href: `/${slug}/sessions/record` },
		...DASHBOARD_TOOLS.slice(at),
	];
}
