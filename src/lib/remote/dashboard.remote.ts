import { error } from "@sveltejs/kit";
import { command, getRequestEvent } from "$app/server";
import {
	accountOfProject,
	accountOfRecordingSession,
	accountOfSetList,
	accountOfSong,
	requireMember,
	requireSuperAdmin,
	requireUser,
	viewerOf,
} from "#lib/server/access.js";
import {
	activityItemOf,
	deleteChatMessage,
	deleteComment,
	deleteDemo,
	deleteMix,
	deleteSessionChatMessage,
	deleteSessionComment,
	deleteSessionRecording,
	deleteSong,
	deleteSongDocVersion,
	deleteStem,
	projectRolesOf,
	projectViewRow,
	setDashboardPin,
	songViewRow,
} from "#lib/server/data.js";
import { scheduleMix } from "#lib/server/jobs.js";
import { deleteProject } from "#lib/server/projectLifecycle.js";
import { canViewProject, canViewSong } from "#lib/server/viewAccess.js";
import type { ActivityKind } from "#lib/constants/dashboardActivity.js";
import { ActivityItemSchema } from "#lib/val/ActivityItemSchema.js";
import { DashboardPinSchema, type DashboardPinKind } from "#lib/val/DashboardPinSchema.js";

const accountOf: Record<DashboardPinKind, (id: string) => Promise<string | null>> = {
	song: accountOfSong,
	project: accountOfProject,
	session: accountOfRecordingSession,
	setList: accountOfSetList,
};

/** Whether a member may open the target (viewAccess.ts): a restricted project, or a song in one, needs a role on the project; every member may open a session or a set list. */
async function mayOpen(locals: App.Locals, kind: DashboardPinKind, id: string, accountId: string) {
	if (kind === "session" || kind === "setList") return true;
	const roles = await projectRolesOf(accountId, requireUser(locals).id);
	const who = viewerOf(locals, accountId, roles);
	if (kind === "song") {
		const row = await songViewRow(id);
		return row !== null && canViewSong(row, who, []);
	}
	const row = await projectViewRow(id);
	return row !== null && canViewProject(row, who, []);
}

/** A person's own dashboard (docs/dashboard-plan.md, step 5): pinning a song, project, session or set list they may open. A target they may not is "not found", like its page. */
export const setPin = command(DashboardPinSchema, async ({ kind, id, pinned }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const accountId = await accountOf[kind](id);
	if (!accountId) error(404, "Not found");
	requireMember(locals, accountId);
	if (!(await mayOpen(locals, kind, id, accountId))) error(404, "Not found");
	await setDashboardPin(user.id, kind, id, accountId, pinned);
	return { pinned };
});

/** A stem's removal re-renders its song's mix, as the song page's delete does. */
async function removeStem(accountId: string, id: string) {
	const removed = await deleteStem(accountId, id);
	if (removed) scheduleMix([removed.songId]);
}

/** A project is deleted only once archived (projectLifecycle.ts), and the Activity lists active ones: that is its page's job. */
async function removeProject(accountId: string, id: string) {
	if ((await deleteProject(accountId, id)) === "active")
		error(400, "Archive the project on its page, then delete it there");
}

/** Per kind, the data layer's own delete for the event's row (never a raw delete: each clears its children and files). */
const REMOVE: Record<ActivityKind, (accountId: string, id: string) => Promise<unknown>> = {
	stem: removeStem,
	demo: deleteDemo,
	mix: deleteMix,
	"session-recording": deleteSessionRecording,
	doc: deleteSongDocVersion,
	chat: (_accountId, id) => deleteChatMessage(id),
	"session-chat": (_accountId, id) => deleteSessionChatMessage(id),
	comment: (_accountId, id) => deleteComment(id),
	"session-comment": (_accountId, id) => deleteSessionComment(id),
	song: deleteSong,
	project: removeProject,
};

/**
 * A super admin removes something they made in an account they do not really
 * belong to (acting as its owner), from that account's dashboard Activity: a
 * stem, a demo, a mix, a recording, one version of a doc, a chat message, a
 * comment, a song or a project. Anything else (someone else's row, an account
 * they belong to, a row that is gone) is "not found". The acting membership
 * goes through requireMember, so the removal is audited like any acting action.
 */
export const removeActivityItem = command(ActivityItemSchema, async ({ kind, rowId }) => {
	const { locals } = getRequestEvent();
	const admin = requireSuperAdmin(locals);
	const row = await activityItemOf(kind, rowId);
	const acting = row && locals.memberships.find((m) => m.accountId === row.accountId)?.actingAs;
	if (!row || !acting || row.actorId !== admin.id) error(404, "Not found");
	requireMember(locals, row.accountId);
	await REMOVE[kind](row.accountId, rowId);
	return { removed: true };
});
