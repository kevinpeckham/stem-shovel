import { requireSignedIn } from "#lib/server/access.js";
import { presentUrl } from "#lib/server/blob.js";
import {
	accountCounts,
	latestRecordingSession,
	projectRolesOf,
	recentProjects,
	recentSongs,
	recentUserIdeas,
} from "#lib/server/data.js";
import { listInbox } from "#lib/server/notifications.js";
import { canViewProject, canViewSong, type Viewer } from "#lib/server/viewAccess.js";
import { realMemberships, type Membership } from "#lib/utils/actingMemberships.js";
import { inboxDigest } from "#lib/utils/inboxDigest.js";
import type { PageServerLoad } from "./$types";

const PROJECTS = 4;
const SONGS = 5;
const IDEAS = 3;
/** Fetched past the shown number, so restricted projects the person cannot open leave room for others. */
const SLACK = 3;

/** One account's part of the dashboard: its counts, newest session, and the recent projects and songs the person may open. */
async function dashboardAccount(m: Membership, userId: string) {
	const [counts, latestSession, projectRows, songRows, projectRoles] = await Promise.all([
		accountCounts(m.accountId),
		latestRecordingSession(m.accountId),
		recentProjects(m.accountId, PROJECTS * SLACK),
		recentSongs(m.accountId, SONGS * SLACK),
		projectRolesOf(m.accountId, userId),
	]);
	const who: Viewer = { accountRole: m.role, projectRoles };
	const projects = await Promise.all(
		projectRows
			.filter((p) => canViewProject(p, who, []))
			.slice(0, PROJECTS)
			.map(async (p) => ({
				id: p.id,
				name: p.name,
				slug: p.slug,
				songCount: p.songCount,
				imageUrl: await presentUrl(p.imageUrl),
			})),
	);
	const songs = songRows
		.filter((s) => s.project.status === "active" && canViewSong(s, who, []))
		.slice(0, SONGS)
		.map((s) => ({
			id: s.id,
			title: s.title,
			href: `/${m.slug}/projects/${s.project.slug}/${s.slug}`,
			project: s.project.name,
			updatedAt: s.updatedAt,
		}));
	return { slug: m.slug, name: m.name, role: m.role, counts, latestSession, projects, songs };
}

/**
 * Where a signed-in person lands (docs/dashboard-plan.md): what is new in
 * their inbox, their own newest ideas, and for each account they really
 * belong to (not a super admin's acting ones) its newest session and the
 * projects and songs touched last.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	const memberships = realMemberships(locals.memberships);
	const [inbox, ideas, accounts] = await Promise.all([
		listInbox(user.id),
		recentUserIdeas(user.id, IDEAS),
		Promise.all(memberships.map((m) => dashboardAccount(m, user.id))),
	]);
	return { accounts, digest: inboxDigest(inbox), ideas };
};
