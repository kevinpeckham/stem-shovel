import { publicBlobUrl } from "#lib/server/blob.js";
import { isEditor } from "#lib/server/access.js";
import { aiAvailable } from "#lib/server/aiDetect.js";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "#lib/server/currentAccount.js";
import {
	getAppSetting,
	listBeats,
	listChordStyles,
	listDrumKitManifests,
	listPianoPresets,
	listStudioSongs,
	sitePianoPresets,
	siteAmpPresets,
	listAmpPresets,
} from "#lib/server/data.js";
import { pageCopy } from "#lib/server/pageCopy.js";
import { songTargets } from "#lib/server/songTargets.js";
import { realMemberships } from "#lib/utils/actingMemberships.js";
import copyFallback from "../../../scripts/user-docs/studio-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The Studio (docs/multitrack-recorder.md), the user's own page like the
 * Idea Recorder: songs are ideas of kind "song" and belong to the user,
 * whichever account they were recorded in. New sources are filed under the
 * current account (src/lib/server/currentAccount.ts), where their storage
 * counts; a bounce can go to a song in any account the user edits. Sources
 * come along as metadata (a URL to fetch on demand, never the audio).
 * Usable signed out, like the looper: the song then lives in the browser.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	const user = locals.user;
	const editing = realMemberships(locals.memberships).filter((m) => isEditor(m.role));
	// Signed out, or a member of no editing account: the song lives in the browser (docs/multitrack-recorder.md, "Signed out") until an account takes it.
	const member = user ? pickAccount(editing, cookies.get(CURRENT_ACCOUNT_COOKIE)) : null;
	return {
		signedIn: !!user,
		account: member
			? { id: member.accountId, slug: member.slug, name: member.name, canEdit: true }
			: null,
		// Their own songs and the ones shared with the band in the accounts they edit (D7).
		songs: user
			? await listStudioSongs(
					user.id,
					editing.map((m) => m.accountId),
				)
			: [],
		projects: user ? await songTargets(editing) : [],
		// The song the home page demos (docs/multitrack-recorder.md, "The home demo"): marked in the list, not deletable here.
		homeDemoId: (await getAppSetting("homeStudioSongId")) ?? null,
		// The page's words (title, intro, the tips under the device) from its copy doc, edited in the app (docs/page-copy.md).
		copy: await pageCopy("studio-page", copyFallback, locals),
		// The instruments in the panels (docs/multitrack-recorder.md, phase 2), as the looper page has them: the account's beats, kits and presets.
		pianoSamplesBase: publicBlobUrl("piano/v1"),
		beats: member ? await listBeats(member.accountId) : [],
		kits: await listDrumKitManifests(member?.accountId ?? null),
		textToBeat: aiAvailable(),
		sitePresets: await sitePianoPresets(),
		// The Practice Amp's presets (docs/practice-amp.md, "Presets"), for its panel.
		ampSitePresets: { guitar: await siteAmpPresets("guitar"), bass: await siteAmpPresets("bass") },
		ampPresets: member ? await listAmpPresets(member.accountId) : [],
		chordPresets: await sitePianoPresets("chords"),
		pianoPresets: member ? await listPianoPresets(member.accountId) : [],
		chordStyles: member ? await listChordStyles(member.accountId) : [],
		presetAdmin: locals.user?.isSystemAdmin === true,
	};
};
