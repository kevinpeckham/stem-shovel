import { form, getRequestEvent } from "$app/server";
import {
	accountOfProject,
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

/** Any member makes a viewing link for a song or a project of their account. */
export const createShareLink = form(
	ShareLinkCreateSchema,
	async ({ songId, mixId, projectId, note, maxUses, expiresDays }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		if (await rateLimited(`sharelink:${user.id}`, 60, HOUR))
			error(429, "Too many links in one hour.");
		const m = songId
			? await memberOf(locals, accountOfSong, songId)
			: await memberOf(locals, accountOfProject, projectId);
		// A link made for a mix (docs/mixes.md): the mix must be this song's.
		if (mixId && (!songId || (await mixOwnership(mixId))?.songId !== songId))
			error(404, "Mix not found");
		const row = await create(
			m.accountId,
			user.id,
			songId ? { songId, mixId: mixId || undefined } : { projectId },
			{
				note,
				maxUses,
				expiresDays,
			},
		);
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
