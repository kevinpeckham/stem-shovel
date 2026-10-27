import type { DashboardEntry } from "#lib/constants/dashboardLinks.js";
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
/** A cap on each of Your Songs (per account), Your Ideas, Your Multitrack Recordings and Your Loops: all of them in practice, searched and paged in the browser. */
const IDEAS = 500;
/** Fetched past the shown number, so restricted projects the person cannot open leave room for others. */
const SLACK = 3;

/** One account's tile: its counts (for the checklist) and the recent projects, songs and sessions the person may open; `allSongs` is every song they may open, for Your Songs. */
async function dashboardAccount(m: Membership, userId: string) {
	const [counts, sessions, projectRows, songRows, projectRoles] = await Promise.all([
		accountCounts(m.accountId),
		recentRecordingSessions(m.accountId, SHOWN),
		recentProjects(m.accountId, SHOWN * SLACK),
		recentSongs(m.accountId, IDEAS),
		projectRolesOf(m.accountId, userId),
	]);
	const who: Viewer = { accountRole: m.role, projectRoles };
	const projects = projectRows
		.filter((p) => canViewProject(p, who, []))
		.slice(0, SHOWN)
		.map((p) => ({ id: p.id, name: p.name, slug: p.slug, songCount: p.songCount }));
	const allSongs = songRows
		.filter((s) => s.project.status === "active" && canViewSong(s, who, []))
		.map((s) => ({
			id: s.id,
			title: s.title,
			href: `/${m.slug}/projects/${s.project.slug}/${s.slug}`,
			project: s.project.name,
			when: s.updatedAt,
		}));
	const songs = allSongs
		.slice(0, SHOWN)
		.map(({ id, title, href, project }) => ({ id, title, href, project }));
	return { slug: m.slug, name: m.name, role: m.role, counts, sessions, projects, songs, allSongs };
}

/** Your Songs: every song the person may open across their accounts, last changed first, each under its project (and its account, when they belong to several). */
function allSongs(tiles: Awaited<ReturnType<typeof dashboardAccount>>[]): DashboardEntry[] {
	const several = tiles.length > 1;
	return tiles
		.flatMap((t) =>
			t.allSongs.map(({ id, title, href, project, when }) => ({
				id,
				title,
				href,
				when,
				meta: several ? `${project} · ${t.name}` : project,
			})),
		)
		.sort((a, b) => b.when.getTime() - a.when.getTime());
}

/** The person's ideas of one kind as dashboard entries, each linking into the tool that made it. */
function entries(
	rows: { id: string; title: string; createdAt: Date }[],
	href: (id: string) => string,
): DashboardEntry[] {
	return rows.map((r) => ({ id: r.id, title: r.title, href: href(r.id), when: r.createdAt }));
}

/**
 * Where a signed-in person lands (docs/dashboard-plan.md): a tile per
 * account they really belong to (not a super admin's acting ones) with its
 * recent projects, songs and sessions; their songs across those accounts;
 * their own ideas, loops and multitrack recordings (all of them, newest
 * first); and what is new in their inbox.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	const memberships = realMemberships(locals.memberships);
	const [inbox, ideaRows, loopRows, multitrackRows, tiles] = await Promise.all([
		listInbox(user.id),
		recentUserIdeas(user.id, "idea", IDEAS),
		recentUserIdeas(user.id, "loop", IDEAS),
		recentUserIdeas(user.id, "song", IDEAS),
		Promise.all(memberships.map((m) => dashboardAccount(m, user.id))),
	]);
	const accounts = tiles.map(({ slug, name, role, counts, sessions, projects, songs }) => ({
		slug,
		name,
		role,
		counts,
		sessions,
		projects,
		songs,
	}));
	return {
		accounts,
		digest: inboxDigest(inbox),
		songs: allSongs(tiles),
		ideas: entries(ideaRows, () => "/idea-recorder"),
		loops: entries(loopRows, () => "/looper"),
		multitracks: entries(
			multitrackRows,
			(id) => `/multitrack-recorder?song=${encodeURIComponent(id)}`,
		),
	};
};
