import {
	DASHBOARD_ACTIVITY_CAP,
	DASHBOARD_ACTIVITY_DAYS,
	DASHBOARD_LIST_CAP,
	type Conversation,
	type DashboardEntry,
} from "#lib/constants/dashboardLinks.js";
import { SESSION_KIND_LABELS } from "#lib/constants/sessionRecordings.js";
import { STAGE_LABEL } from "#lib/constants/songStages.js";
import { requireSignedIn } from "#lib/server/access.js";
import {
	accountActivity,
	accountCounts,
	accountPendingWork,
	accountQuota,
	projectRolesOf,
	recentProjects,
	recentRecordingSessions,
	recentSongs,
	recentUserIdeas,
	unreadSessionChats,
	unreadSongChats,
} from "#lib/server/data.js";
import { listInbox } from "#lib/server/notifications.js";
import { canViewProject, canViewSong, type Viewer } from "#lib/server/viewAccess.js";
import { realMemberships, type Membership } from "#lib/utils/actingMemberships.js";
import { activityText } from "#lib/utils/activityText.js";
import { formatWhen } from "#lib/utils/formatWhen.js";
import { inboxDigest } from "#lib/utils/inboxDigest.js";
import { pendingText } from "#lib/utils/pendingText.js";
import { plural } from "#lib/utils/plural.js";
import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";
import { songStage } from "#lib/utils/songStage.js";
import type { PageServerLoad } from "./$types";

/** One account: its tile's counts and the person's role; the newest projects, songs and sessions they may open, for the Your Projects, Your Songs and Your Sessions sections; its chats with messages they have not seen; what happened in it lately and what is still in progress. */
async function dashboardAccount(m: Membership, userId: string, since: Date) {
	const admin = m.role === "owner" || m.role === "admin";
	const [
		counts,
		sessions,
		projectRows,
		songRows,
		projectRoles,
		songChats,
		sessionChats,
		quota,
		activity,
		pending,
	] = await Promise.all([
		accountCounts(m.accountId),
		recentRecordingSessions(m.accountId, DASHBOARD_LIST_CAP),
		recentProjects(m.accountId, DASHBOARD_LIST_CAP),
		recentSongs(m.accountId, DASHBOARD_LIST_CAP),
		projectRolesOf(m.accountId, userId),
		unreadSongChats(m.accountId, m.slug, userId),
		unreadSessionChats(m.accountId, m.slug, userId),
		// The plan's storage and seats are an owner's or admin's concern (docs/billing.md); a member's tile goes without.
		admin ? accountQuota(m.accountId) : null,
		accountActivity(m.accountId, m.slug, since, DASHBOARD_ACTIVITY_CAP),
		accountPendingWork(m.accountId, m.slug),
	]);
	const who: Viewer = { accountRole: m.role, projectRoles };
	const projects = projectRows.filter((p) => canViewProject(p, who, []));
	const songs = songRows.filter((s) => s.project.status === "active" && canViewSong(s, who, []));
	return {
		slug: m.slug,
		name: m.name,
		role: m.role,
		counts,
		quota,
		projects,
		songs,
		sessions,
		songChats: songChats.filter((c) => canViewSong(c, who, [])),
		sessionChats,
		// A song's event or job shows only when the person may open the song; a session's shows to every member.
		activity: activity.filter((e) => !e.song || canViewSong(e.song, who, [])),
		pending: pending.filter((p) => !p.song || canViewSong(p.song, who, [])),
	};
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
				account: t.slug,
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
				account: t.slug,
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
				account: t.slug,
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

/** Activity: what happened across the person's accounts in the last DASHBOARD_ACTIVITY_DAYS, newest first; the title is the song or session, the line under it who did what (and the account, with several). */
function activityEntries(tiles: Tile[]): DashboardEntry[] {
	const several = tiles.length > 1;
	return tiles
		.flatMap((t) =>
			t.activity.map((e) => ({
				id: `${t.slug}:${e.id}`,
				title: e.title,
				href: e.href,
				when: e.at,
				whenText: formatWhen(e.at),
				account: t.slug,
				meta: line([activityText(e), several ? t.name : ""]),
			})),
		)
		.sort(newestFirst);
}

/** In progress: what the server has not finished across the person's accounts, oldest first, each under its state and since when. */
function pendingEntries(tiles: Tile[]): DashboardEntry[] {
	const several = tiles.length > 1;
	return tiles
		.flatMap((t) =>
			t.pending.map((p) => ({
				id: `${t.slug}:${p.id}`,
				title: p.title,
				href: p.href,
				when: p.since,
				whenText: formatWhen(p.since),
				account: t.slug,
				meta: line([pendingText(p), several ? t.name : ""]),
			})),
		)
		.sort((a, b) => a.when.getTime() - b.when.getTime());
}

/** Conversations: every song and session chat with messages the person has not seen, across their accounts, newest message first. */
function conversations(tiles: Tile[]): Conversation[] {
	const several = tiles.length > 1;
	return tiles
		.flatMap((t) => [
			...t.songChats.map((c) => ({
				id: c.songId,
				title: c.title,
				meta: line([c.project.name, several ? t.name : ""]),
				href: c.href,
				unread: c.unread,
				latest: c.latest,
			})),
			...t.sessionChats.map((c) => ({
				id: c.sessionId,
				title: sessionDisplayName(c),
				meta: line([dayText(c.startsOn), several ? t.name : ""]),
				href: c.href,
				unread: c.unread,
				latest: c.latest,
			})),
		])
		.sort((a, b) => b.latest.getTime() - a.latest.getTime());
}

/** The kinds of notification that are a comment or a mention waiting for the person. */
const COMMENT_KINDS = new Set(["comment", "mention"]);

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
 * accounts; their own ideas, loops and multitrack recordings, newest
 * first; what is new in their inbox; the chats, comments and mentions
 * waiting for them; what happened in their accounts this week; and what
 * the server has not finished.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	const memberships = realMemberships(locals.memberships);
	const since = new Date(Date.now() - DASHBOARD_ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
	const [inbox, ideaRows, loopRows, multitrackRows, tiles] = await Promise.all([
		listInbox(user.id),
		recentUserIdeas(user.id, "idea", DASHBOARD_LIST_CAP),
		recentUserIdeas(user.id, "loop", DASHBOARD_LIST_CAP),
		recentUserIdeas(user.id, "song", DASHBOARD_LIST_CAP),
		Promise.all(memberships.map((m) => dashboardAccount(m, user.id, since))),
	]);
	return {
		accounts: tiles.map(({ slug, name, role, counts, quota }) => ({
			slug,
			name,
			role,
			counts,
			quota,
		})),
		digest: inboxDigest(inbox),
		chats: conversations(tiles),
		activity: activityEntries(tiles),
		pending: pendingEntries(tiles),
		comments: inbox
			.filter((i) => !i.readAt && COMMENT_KINDS.has(i.kind))
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
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
