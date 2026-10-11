import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "#lib/server/currentAccount.js";
import { aiAvailable } from "#lib/server/aiDetect.js";
import { publicBlobUrl } from "#lib/server/blob.js";
import {
	listAmpPresets,
	listBeats,
	listChordStyles,
	listDrumKitManifests,
	listPianoPresets,
	siteAmpPresets,
	sitePianoPresets,
} from "#lib/server/data.js";
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
		// The drum machine's panel (a beat to practise to), as the looper has it.
		kits: await listDrumKitManifests(member?.accountId ?? null),
		beats: member ? await listBeats(member.accountId) : [],
		textToBeat: aiAvailable(),
		// The chord player's panel, the amp's demo input (docs/practice-amp.md, "Demo through the chord player"), as the looper has it.
		pianoSamplesBase: publicBlobUrl("piano/v1"),
		chordPresets: await sitePianoPresets("chords"),
		pianoPresets: member ? await listPianoPresets(member.accountId) : [],
		chordStyles: member ? await listChordStyles(member.accountId) : [],
		sitePresets: { guitar, bass },
		account: member
			? { id: member.accountId, name: member.name, canEdit: member.role !== "viewer" }
			: null,
		presets: member ? await listAmpPresets(member.accountId) : [],
		presetAdmin: locals.user?.isSystemAdmin === true,
		copy: await pageCopy("practice-amp-page", copyFallback, locals),
	};
};
