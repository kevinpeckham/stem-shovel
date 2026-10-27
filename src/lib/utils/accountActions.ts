import type { DashboardLink } from "#lib/constants/dashboardLinks.js";

/** The dashboard's quick actions for one account, each into the account's own pages. */
export function accountActions(slug: string): DashboardLink[] {
	return [
		{ label: "Add a recording", href: `/${slug}/sessions` },
		{ label: "New song", href: `/${slug}/projects` },
		{ label: "New idea", href: "/idea-recorder" },
		{ label: "Record a session", href: `/${slug}/sessions/record` },
	];
}
