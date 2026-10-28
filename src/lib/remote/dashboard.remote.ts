import { error } from "@sveltejs/kit";
import { command, getRequestEvent } from "$app/server";
import {
	accountOfProject,
	accountOfRecordingSession,
	accountOfSong,
	requireMember,
	requireUser,
	viewerOf,
} from "#lib/server/access.js";
import { projectRolesOf, projectViewRow, setDashboardPin, songViewRow } from "#lib/server/data.js";
import { canViewProject, canViewSong } from "#lib/server/viewAccess.js";
import { DashboardPinSchema, type DashboardPinKind } from "#lib/val/DashboardPinSchema.js";

const accountOf: Record<DashboardPinKind, (id: string) => Promise<string | null>> = {
	song: accountOfSong,
	project: accountOfProject,
	session: accountOfRecordingSession,
};

/** Whether a member may open the target (viewAccess.ts): a restricted project, or a song in one, needs a role on the project; every member may open a session. */
async function mayOpen(locals: App.Locals, kind: DashboardPinKind, id: string, accountId: string) {
	if (kind === "session") return true;
	const roles = await projectRolesOf(accountId, requireUser(locals).id);
	const who = viewerOf(locals, accountId, roles);
	if (kind === "song") {
		const row = await songViewRow(id);
		return row !== null && canViewSong(row, who, []);
	}
	const row = await projectViewRow(id);
	return row !== null && canViewProject(row, who, []);
}

/** A person's own dashboard (docs/dashboard-plan.md, step 5): pinning a song, project or session they may open. A target they may not is "not found", like its page. */
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
