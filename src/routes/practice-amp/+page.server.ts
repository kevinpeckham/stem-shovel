import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "#lib/server/currentAccount.js";
import { listAmpPresets, siteAmpPresets } from "#lib/server/data.js";
import { pageCopy } from "#lib/server/pageCopy.js";
import { realMemberships } from "#lib/utils/actingMemberships.js";
import copyFallback from "../../../scripts/user-docs/practice-amp-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The Practice Amp (docs/practice-amp.md): usable by anyone, signed in or
 * not; its settings stay in the browser. The site's presets per
 * instrument and, for a signed-in member, their account's (the account
 * neutral pages treat as theirs, src/lib/server/currentAccount.ts). Its
 * words come from its copy doc, edited in the app (docs/page-copy.md).
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	const member = locals.user
		? pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE))
		: null;
	const [guitar, bass] = await Promise.all([siteAmpPresets("guitar"), siteAmpPresets("bass")]);
	return {
		sitePresets: { guitar, bass },
		account: member
			? { id: member.accountId, name: member.name, canEdit: member.role !== "viewer" }
			: null,
		presets: member ? await listAmpPresets(member.accountId) : [],
		presetAdmin: locals.user?.isSystemAdmin === true,
		copy: await pageCopy("practice-amp-page", copyFallback, locals),
	};
};
