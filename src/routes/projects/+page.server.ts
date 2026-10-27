import { requireSignedIn } from "#lib/server/access.js";
import { projectRolesOf, recentProjects } from "#lib/server/data.js";
import { canViewProject, type Viewer } from "#lib/server/viewAccess.js";
import { realMemberships, type Membership } from "#lib/utils/actingMemberships.js";
import type { PageServerLoad } from "./$types";

/** A cap per account: every project in practice, sorted and filtered in the browser. */
const LIMIT = 500;

/** One account's projects the person may open (the dashboard's rule), as rows of the Projects table. */
async function accountProjects(m: Membership, userId: string) {
	const [rows, projectRoles] = await Promise.all([
		recentProjects(m.accountId, LIMIT),
		projectRolesOf(m.accountId, userId),
	]);
	const who: Viewer = { accountRole: m.role, projectRoles };
	return rows
		.filter((p) => canViewProject(p, who, []))
		.map((p) => ({
			id: p.id,
			title: p.name,
			href: `/${m.slug}/projects/${p.slug}`,
			account: m.name,
			songCount: p.songCount,
			updatedAt: p.updatedAt,
			/** What the search matches besides the name. */
			meta: m.name,
		}));
}

/** Your Projects: every project the person may open across the accounts they really belong to, last changed first. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	const memberships = realMemberships(locals.memberships);
	const perAccount = await Promise.all(memberships.map((m) => accountProjects(m, user.id)));
	return {
		projects: perAccount.flat().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
	};
};
