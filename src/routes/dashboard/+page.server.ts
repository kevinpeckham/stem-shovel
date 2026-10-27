import { DASHBOARD_LIST_CAP, type DashboardEntry } from "#lib/constants/dashboardLinks.js";
import { SESSION_KIND_LABELS } from "#lib/constants/sessionRecordings.js";
import { STAGE_LABEL } from "#lib/constants/songStages.js";
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
import { plural } from "#lib/utils/plural.js";
import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";
import { songStage } from "#lib/utils/songStage.js";
import type { PageServerLoad } from "./$types";

/** One account: its tile's counts and the person's role, and every project, song and session they may open, for the Your Projects, Your Songs and Your Sessions sections. */
async function dashboardAccount(m: Membership, userId: string) {
	const [counts, sessions, projectRows, songRows, projectRoles] = await Promise.all([
		accountCounts(m.accountId),
		recentRecordingSessions(m.accountId, DASHBOARD_LIST_CAP),
		recentProjects(m.accountId, DASHBOARD_LIST_CAP),
		recentSongs(m.accountId, DASHBOARD_LIST_CAP),
		projectRolesOf(m.accountId, userId),
	]);
	const who: Viewer = { accountRole: m.role, projectRoles };
	const projects = projectRows.filter((p) => canViewProject(p, who, []));
	const songs = songRows.filter((s) => s.project.status === "active" && canViewSong(s, who, []));
	return { slug: m.slug, name: m.name, role: m.role, counts, projects, songs, sessions };
}

type Tile = Awaited<ReturnType<typeof dashboardAccount>>;

const newestFirst = (a: DashboardEntry, b: DashboardEntry) => b.when.getTime() - a.when.getTime();
/** The line under an entry's title: its facts joined with a middle dot, the account among them only when the person belongs to several. */
const line = (facts: string[]) => facts.filter(Boolean).join(" · ");

/** Your Projects: every project the person may open across their accounts, last changed first, with its song count. */
function projectEntries(tiles: Tile[]): DashboardEntry[] {
	const several = tiles.length > 1;
	return tiles
		.flatMap((t) =>
			t.projects.map((p) => ({
				id: p.id,
				title: p.name,
				href: `/${t.slug}/projects/${p.slug}`,
				when: p.updatedAt,
				meta: line([plural(p.songCount, "song"), several ? t.name : ""]),
			})),
		)
		.sort(newestFirst);
}

/** Your Songs: every song the person may open across their accounts, last changed first, under its project, stage and counts of stems and demos. */
function songEntries(tiles: Tile[]): DashboardEntry[] {
	const several = tiles.length > 1;
	return tiles
		.flatMap((t) =>
			t.songs.map((s) => ({
				id: s.id,
				title: s.title,
				href: `/${t.slug}/projects/${s.project.slug}/${s.slug}`,
				when: s.updatedAt,
				meta: line([
					s.project.name,
					STAGE_LABEL[songStage(s)],
					plural(s.stemCount, "stem"),
					plural(s.demoCount, "demo"),
					several ? t.name : "",
				]),
			})),
		)
		.sort(newestFirst);
}

/** Your Sessions: every session across the person's accounts, latest day first, under its kind, place and recording count. */
function sessionEntries(tiles: Tile[]): DashboardEntry[] {
	const several = tiles.length > 1;
	return tiles
		.flatMap((t) =>
			t.sessions.map((s) => ({
				id: s.id,
				title: sessionDisplayName(s),
				href: `/${t.slug}/sessions/s/${s.id}`,
				when: new Date(s.startsOn),
				whenText: dayText(s.startsOn),
				meta: line([
					SESSION_KIND_LABELS[s.kind],
					s.place.trim(),
					plural(s.recordingCount, "recording"),
					several ? t.name : "",
				]),
			})),
		)
		.sort(newestFirst);
}

/** The person's ideas of one kind as dashboard entries, each linking into the tool that made it. */
function ideaEntries(
	rows: { id: string; title: string; createdAt: Date }[],
	href: (id: string) => string,
): DashboardEntry[] {
	return rows.map((r) => ({ id: r.id, title: r.title, href: href(r.id), when: r.createdAt }));
}

/**
 * Where a signed-in person lands (docs/dashboard-plan.md): a tile per
 * account they really belong to (not a super admin's acting ones) with its
 * counts and their role; their projects, songs and sessions across those
 * accounts; their own ideas, loops and multitrack recordings (all of them,
 * newest first); and what is new in their inbox.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	const memberships = realMemberships(locals.memberships);
	const [inbox, ideaRows, loopRows, multitrackRows, tiles] = await Promise.all([
		listInbox(user.id),
		recentUserIdeas(user.id, "idea", DASHBOARD_LIST_CAP),
		recentUserIdeas(user.id, "loop", DASHBOARD_LIST_CAP),
		recentUserIdeas(user.id, "song", DASHBOARD_LIST_CAP),
		Promise.all(memberships.map((m) => dashboardAccount(m, user.id))),
	]);
	return {
		accounts: tiles.map(({ slug, name, role, counts }) => ({ slug, name, role, counts })),
		digest: inboxDigest(inbox),
		projects: projectEntries(tiles),
		songs: songEntries(tiles),
		sessions: sessionEntries(tiles),
		ideas: ideaEntries(ideaRows, () => "/idea-recorder"),
		loops: ideaEntries(loopRows, () => "/looper"),
		multitracks: ideaEntries(
			multitrackRows,
			(id) => `/multitrack-recorder?song=${encodeURIComponent(id)}`,
		),
	};
};
