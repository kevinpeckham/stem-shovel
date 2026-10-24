import { presentUrl, publicBlobUrl } from "#lib/server/blob.js";
import { canEdit, isEditor } from "#lib/server/access.js";
import { aiAvailable } from "#lib/server/aiDetect.js";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "#lib/server/currentAccount.js";
import {
	dawprojectFileToOpen,
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
import { scheduleStudioFlac } from "#lib/server/jobs.js";
import { studioSourceWantsFlac } from "#lib/utils/studioSourceWantsFlac.js";
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
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const user = locals.user;
	// A DAWproject attachment to open here (`?open=<file id>`, the song page's Files): a member who edits its account.
	const openId = url.searchParams.get("open");
	const toOpen = openId && user ? await dawprojectFileToOpen(openId) : null;
	const openFile =
		toOpen && canEdit(locals, toOpen.accountId)
			? {
					url: (await presentUrl(toOpen.url)) ?? "",
					filename: toOpen.filename,
					title: toOpen.title,
				}
			: null;
	const editing = realMemberships(locals.memberships).filter((m) => isEditor(m.role));
	const songs = user
		? await listStudioSongs(
				user.id,
				editing.map((m) => m.accountId),
			)
		: [];
	// Sources still in WAV (recorded before the FLAC pass, or marked ready by the webhook alone) go to the
	// jobs function (docs/multitrack-recorder.md "Scale and structure"), decided on the rows in hand.
	const wavSources = songs
		.flatMap((s) => s.sources)
		// The job itself skips a source not ready yet.
		.filter((src) => studioSourceWantsFlac({ codec: src.codec, name: src.filename }))
		.map((src) => src.id)
		.slice(0, 50);
	if (wavSources.length) scheduleStudioFlac(wavSources);
	// Signed out, or a member of no editing account: the song lives in the browser (docs/multitrack-recorder.md, "Signed out") until an account takes it.
	const member = user ? pickAccount(editing, cookies.get(CURRENT_ACCOUNT_COOKIE)) : null;
	return {
		signedIn: !!user,
		openFile,
		account: member
			? { id: member.accountId, slug: member.slug, name: member.name, canEdit: true }
			: null,
		// Their own songs and the ones shared with the band in the accounts they edit (D7).
		songs,
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
