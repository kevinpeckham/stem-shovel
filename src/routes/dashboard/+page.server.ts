import { requireSignedIn } from "#lib/server/access.js";
import {
	accountCounts,
	projectRolesOf,
	recentProjects,
	recentRecordingSessions,
	recentSongs,
	recentUserIdeas,
} from "#lib/server/data.js";
import { listInbox } from "#lib/server/notifications.js";
import { canViewProject, canViewSong, type Viewer } from "#lib/server/viewAccess.js";
import { realMemberships, type Membership } from "#lib/utils/actingMemberships.js";
import { inboxDigest } from "#lib/utils/inboxDigest.js";
import type { PageServerLoad } from "./$types";

/** Entries in each of an account tile's lists. */
const SHOWN = 6;
/** Entries in each of Your ideas, Your loops and Your multitrack recordings. */
const IDEAS = 5;
/** Fetched past the shown number, so restricted projects the person cannot open leave room for others. */
const SLACK = 3;

/** One account's tile: its counts (for the checklist) and the recent projects, songs and sessions the person may open. */
async function dashboardAccount(m: Membership, userId: string) {
	const [counts, sessions, projectRows, songRows, projectRoles] = await Promise.all([
		accountCounts(m.accountId),
		recentRecordingSessions(m.accountId, SHOWN),
		recentProjects(m.accountId, SHOWN * SLACK),
		recentSongs(m.accountId, SHOWN * SLACK),
		projectRolesOf(m.accountId, userId),
	]);
	const who: Viewer = { accountRole: m.role, projectRoles };
	const projects = projectRows
		.filter((p) => canViewProject(p, who, []))
		.slice(0, SHOWN)
		.map((p) => ({ id: p.id, name: p.name, slug: p.slug, songCount: p.songCount }));
	const songs = songRows
		.filter((s) => s.project.status === "active" && canViewSong(s, who, []))
		.slice(0, SHOWN)
		.map((s) => ({
			id: s.id,
			title: s.title,
			href: `/${m.slug}/projects/${s.project.slug}/${s.slug}`,
			project: s.project.name,
		}));
	return { slug: m.slug, name: m.name, role: m.role, counts, sessions, projects, songs };
}

/**
 * Where a signed-in person lands (docs/dashboard-plan.md): a tile per
 * account they really belong to (not a super admin's acting ones) with its
 * recent projects, songs and sessions; their own newest ideas, loops and
 * multitrack recordings; and what is new in their inbox.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	const memberships = realMemberships(locals.memberships);
	const [inbox, ideas, loops, multitracks, accounts] = await Promise.all([
		listInbox(user.id),
		recentUserIdeas(user.id, "idea", IDEAS),
		recentUserIdeas(user.id, "loop", IDEAS),
		recentUserIdeas(user.id, "song", IDEAS),
		Promise.all(memberships.map((m) => dashboardAccount(m, user.id))),
	]);
	return { accounts, digest: inboxDigest(inbox), ideas, loops, multitracks };
};
