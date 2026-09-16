import { form, getRequestEvent } from "$app/server";
import {
	accountOfProject,
	accountOfSong,
	memberOf,
	requireMember,
	requireUser,
} from "$lib/server/access";
import {
	createShareLink as create,
	revokeShareLink as revoke,
	setProjectPrivacy,
	setSongPrivacy,
} from "$lib/server/data";
import { PrivacySchema, ShareLinkCreateSchema, ShareLinkIdSchema } from "$lib/val/ShareLinkSchema";
import { error } from "@sveltejs/kit";

/** Any member makes a project private (members and share links only) or public again. */
export const setProjectPrivate = form(PrivacySchema, async ({ id, isPrivate }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfProject, id);
	if (!(await setProjectPrivacy(m.accountId, id, isPrivate === "true"))) error(404, "Not found");
	return { isPrivate: isPrivate === "true" };
});

export const setSongPrivate = form(PrivacySchema, async ({ id, isPrivate }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfSong, id);
	if (!(await setSongPrivacy(m.accountId, id, isPrivate === "true"))) error(404, "Not found");
	return { isPrivate: isPrivate === "true" };
});

/** Any member makes a viewing link for a song or a project of their account. */
export const createShareLink = form(
	ShareLinkCreateSchema,
	async ({ songId, projectId, note, maxUses, expiresDays }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const m = songId
			? await memberOf(locals, accountOfSong, songId)
			: await memberOf(locals, accountOfProject, projectId);
		const row = await create(m.accountId, user.id, songId ? { songId } : { projectId }, {
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
	for (const m of locals.memberships) {
		requireMember(locals, m.accountId);
		if (await revoke(m.accountId, id)) return { revoked: true };
	}
	error(404, "Share link not found");
});
