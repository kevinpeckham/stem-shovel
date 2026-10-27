import { error } from "@sveltejs/kit";
import { command, getRequestEvent } from "$app/server";
import { accountOfProject, accountOfSong, requireMember, requireUser } from "#lib/server/access.js";
import { accountOfRecordingSession, setDashboardPin } from "#lib/server/data.js";
import { DashboardPinSchema, type DashboardPinKind } from "#lib/val/DashboardPinSchema.js";

const accountOf: Record<DashboardPinKind, (id: string) => Promise<string | null>> = {
	song: accountOfSong,
	project: accountOfProject,
	session: accountOfRecordingSession,
};

/** A person's own dashboard (docs/dashboard-plan.md, step 5): pinning a song, project or session they may open. */
export const setPin = command(DashboardPinSchema, async ({ kind, id, pinned }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const accountId = await accountOf[kind](id);
	if (!accountId) error(404, "Not found");
	requireMember(locals, accountId);
	await setDashboardPin(user.id, kind, id, accountId, pinned);
	return { pinned };
});
