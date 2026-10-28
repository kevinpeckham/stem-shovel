import { form, getRequestEvent } from "$app/server";
import {
	accountOfProject,
	accountOfRecordingSession,
	accountOfSessionRecording,
	accountOfSetList,
	accountOfSong,
	memberOf,
	isEditor,
	requireMember,
	requireUser,
} from "#lib/server/access.js";
import {
	mixOwnership,
	createShareLink as create,
	revokeShareLink as revoke,
	setProjectPrivacy,
	setSongPrivacy,
} from "#lib/server/data.js";
import {
	PrivacySchema,
	ShareLinkCreateSchema,
	ShareLinkIdSchema,
	type ShareLinkCreate,
} from "#lib/val/ShareLinkSchema.js";
import { background } from "#lib/server/background.js";
import { relocateProjectFiles, relocateSongFiles } from "#lib/server/relocate.js";
import { HOUR, rateLimited } from "#lib/server/rateLimit.js";
import { error } from "@sveltejs/kit";

/** Any member makes a project private (members and share links only) or public again. */
export const setProjectPrivate = form(PrivacySchema, async ({ id, isPrivate }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfProject, id);
	if (!(await setProjectPrivacy(m.accountId, id, isPrivate === "true"))) error(404, "Not found");
	// Files follow: into the private store, or back out (src/lib/server/relocate.ts).
	background(async () => {
		await relocateProjectFiles(id);
	});
	return { isPrivate: isPrivate === "true" };
});

export const setSongPrivate = form(PrivacySchema, async ({ id, isPrivate }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfSong, id);
	if (!(await setSongPrivacy(m.accountId, id, isPrivate === "true"))) error(404, "Not found");
	background(async () => {
		await relocateSongFiles(id);
	});
	return { isPrivate: isPrivate === "true" };
});

type ShareTarget = Pick<
	ShareLinkCreate,
	"songId" | "projectId" | "recordingId" | "sessionId" | "setListId"
>;

/** The account the link's target belongs to, as a member of it (a 404 otherwise). */
function memberForTarget(locals: App.Locals, t: ShareTarget) {
	if (t.songId) return memberOf(locals, accountOfSong, t.songId);
	if (t.recordingId) return memberOf(locals, accountOfSessionRecording, t.recordingId);
	if (t.sessionId) return memberOf(locals, accountOfRecordingSession, t.sessionId);
	if (t.setListId) return memberOf(locals, accountOfSetList, t.setListId);
	return memberOf(locals, accountOfProject, t.projectId);
}

/** What the link opens, as data.ts records it (exactly one is set; the schema checks). */
function targetOf(t: ShareTarget, mixId: string) {
	if (t.songId) return { songId: t.songId, mixId: mixId || undefined };
	if (t.recordingId) return { recordingId: t.recordingId };
	if (t.sessionId) return { sessionId: t.sessionId };
	if (t.setListId) return { setListId: t.setListId };
	return { projectId: t.projectId };
}

/** Any member makes a viewing link for a song, a project, a session, a session recording or a set list of their account. */
export const createShareLink = form(
	ShareLinkCreateSchema,
	async ({ mixId, note, maxUses, expiresDays, ...target }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		if (await rateLimited(`sharelink:${user.id}`, 60, HOUR))
			error(429, "Too many links in one hour.");
		const m = await memberForTarget(locals, target);
		// A link made for a mix (docs/mixes.md): the mix must be this song's.
		if (mixId && (!target.songId || (await mixOwnership(mixId))?.songId !== target.songId))
			error(404, "Mix not found");
		const row = await create(m.accountId, user.id, targetOf(target, mixId), {
			note,
			maxUses,
			expiresDays,
		});
		return { code: row.code };
	},
);

export const revokeShareLink = form(ShareLinkIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	// The link's account is not in the payload: each account the caller edits is tried (a viewer-role membership is skipped, as making one needs an editor).
	for (const m of locals.memberships) {
		if (!isEditor(m.role)) continue;
		requireMember(locals, m.accountId);
		if (await revoke(m.accountId, id)) return { revoked: true };
	}
	error(404, "Share link not found");
});
