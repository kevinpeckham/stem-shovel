import { publicBlobUrl } from "$lib/server/blob";
import { isEditor } from "$lib/server/access";
import { aiAvailable } from "$lib/server/aiDetect";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import {
	listBeats,
	listDrumKitManifests,
	listChordStyles,
	listPianoPresets,
	listUserIdeas,
	listUserLoops,
	sitePianoPresets,
} from "$lib/server/data";
import { pageCopy } from "$lib/server/pageCopy";
import { realMemberships } from "$lib/utils/actingMemberships";
import copyFallback from "../../../scripts/user-docs/looper-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The looper (docs/looper.md): usable by anyone, signed in or not (the
 * loop stays in the browser either way). Signed in with an account to
 * edit, a saved loop becomes an idea's take with the layers as its
 * sources, filed under the current account (where its storage counts);
 * the drum machine's beats and the piano's presets in the panels are that
 * account's too. Indexable, like the drum machine page.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	const editing = realMemberships(locals.memberships).filter((m) => isEditor(m.role));
	const member = locals.user ? pickAccount(editing, cookies.get(CURRENT_ACCOUNT_COOKIE)) : null;
	return {
		signedIn: !!locals.user,
		// The user's exported loops, to load back (docs/looper.md, "Export and Load").
		loops: locals.user ? await listUserLoops(locals.user.id) : [],
		// The user's recent takes, to import as layers (docs/looper.md, "Importing a take").
		takes: locals.user ? await recentTakes(locals.user.id) : [],
		account: member
			? { id: member.accountId, name: member.name, slug: member.slug, canEdit: true }
			: null,
		// The page's words (title, intro, the tips under the device) from its copy doc, edited in the app (docs/page-copy.md).
		copy: await pageCopy("looper-page", copyFallback, locals),
		pianoSamplesBase: publicBlobUrl("piano/v1"),
		beats: member ? await listBeats(member.accountId) : [],
		kits: await listDrumKitManifests(member?.accountId ?? null),
		textToBeat: aiAvailable(),
		sitePresets: await sitePianoPresets(),
		chordPresets: await sitePianoPresets("chords"),
		pianoPresets: member ? await listPianoPresets(member.accountId) : [],
		chordStyles: member ? await listChordStyles(member.accountId) : [],
		presetAdmin: locals.user?.isSystemAdmin === true,
	};
};

/** The user's latest forty takes, newest first, as the Load menu lists them for import: idea and take, length, and how many sources a take carries (a loop saved from the looper). */
async function recentTakes(userId: string) {
	const ideas = await listUserIdeas(userId);
	return ideas
		.flatMap((i) =>
			i.takes.map((t) => ({
				id: t.id,
				title: `${i.title} · ${t.title || `Take ${t.takeNumber}`}`,
				durationSeconds: t.durationSeconds,
				sources: t.stems.length,
				createdAt: t.createdAt,
			})),
		)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
		.slice(0, 40);
}
