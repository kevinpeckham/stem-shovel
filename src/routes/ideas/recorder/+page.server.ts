import { publicBlobUrl } from "$lib/server/blob";
import { accountOfSong, isEditor, requireSignedIn } from "$lib/server/access";
import { aiAvailable } from "$lib/server/aiDetect";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import {
	deleteEmptyIdeas,
	listBeats,
	listDrumKitManifests,
	listPianoPresets,
	listUserIdeas,
	parseIdeaInstruments,
	recordingsWantingPlayback,
	songLink,
	sitePianoPresets,
	songPicker,
} from "$lib/server/data";
import { scheduleRecordingPlayback } from "$lib/server/jobs";
import { pageCopy } from "$lib/server/pageCopy";
import copyFallback from "../../../../scripts/user-docs/idea-recorder-page.md?raw";
import { realMemberships } from "$lib/utils/actingMemberships";
import { NanoIdSchema } from "$lib/val/NanoIdSchema";
import type { Config } from "@sveltejs/adapter-vercel";
import { redirect } from "@sveltejs/kit";
import * as v from "valibot";
import type { PageServerLoad } from "./$types";

/** An empty idea younger than this may still have its first take uploading. */
const EMPTY_IDEA_GRACE_MS = 60 * 60 * 1000;

/** Missing MP3s render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/**
 * The Idea Recorder (docs/demo-recording.md), the user's own page: ideas
 * belong to the user, whichever account they were recorded in, and list
 * here together. New takes are filed under the current account (the one
 * neutral pages treat as theirs, src/lib/server/currentAccount.ts), which
 * is where their storage counts; a take can go to a song in any account
 * the user edits. `?song=<id>` remembers where it was opened from. The
 * takes come along as metadata (a URL to play on demand, never the audio).
 */
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const user = requireSignedIn(locals, url);
	const editing = realMemberships(locals.memberships).filter((m) => isEditor(m.role));
	const member = pickAccount(editing, cookies.get(CURRENT_ACCOUNT_COOKIE));
	// Recording needs an account to hold the files (storage is the account's): a user without one is sent to make or join one.
	if (!member) redirect(303, "/accounts");
	const songParam = url.searchParams.get("song");
	const songId = v.safeParse(NanoIdSchema, songParam ?? "");
	// Ideas that never got a take or notes are not worth listing; sweep the old ones.
	await deleteEmptyIdeas(user.id, EMPTY_IDEA_GRACE_MS);
	const ideas = await listUserIdeas(user.id);
	scheduleRecordingPlayback(recordingsWantingPlayback(ideas.flatMap((i) => i.takes)));
	// Song targets across every account the user edits; the account's name labels the project when there is more than one.
	const projects = (
		await Promise.all(
			editing.map(async (m) =>
				(await songPicker(m.accountId)).map((p) => ({
					...p,
					name: editing.length > 1 ? `${m.name} · ${p.name}` : p.name,
				})),
			),
		)
	).flat();
	const fromSongAccount = songId.success ? await accountOfSong(songId.output) : null;
	return {
		account: { id: member.accountId, name: member.name, slug: member.slug, canEdit: true },
		// The piano under the recorder: where this stage keeps the Grand Piano's fuller sample tiers.
		pianoSamplesBase: publicBlobUrl("piano/v1"),
		ideas: ideas.map((i) => ({
			id: i.id,
			title: i.title,
			// Loops saved from the looper are listed only when asked for (docs/looper.md, "Save and Export").
			kind: i.kind,
			notes: i.notes,
			// The instruments as they were with the idea (JSON in the row); a row from before the column, or one that fails the schema, loads nothing.
			instruments: parseIdeaInstruments(i.instruments),
			createdAt: i.createdAt,
			takes: i.takes.map((t) => ({
				id: t.id,
				takeNumber: t.takeNumber,
				title: t.title,
				url: t.url,
				playbackUrl: t.playbackUrl,
				codec: t.codec,
				durationSeconds: t.durationSeconds,
				createdAt: t.createdAt,
				// A multitrack take's sources (docs/demo-recording.md, "Multitrack takes"), ready ones; empty for a stereo take.
				stems: t.stems.map((s) => ({ id: s.id, label: s.label })),
			})),
		})),
		projects,
		// The drum machine's panel (docs/demo-recording.md): the current account's saved beats and whether Text-to-Beat is on.
		beats: await listBeats(member.accountId),
		kits: await listDrumKitManifests(member.accountId),
		textToBeat: aiAvailable(),
		// The piano's panel: the site's demo presets and the current account's own, as the piano page has them.
		sitePresets: await sitePianoPresets(),
		pianoPresets: await listPianoPresets(member.accountId),
		presetAdmin: locals.user?.isSystemAdmin === true,
		// The page's words (title, intro, the tips under the recorder) from its copy doc, edited in the app (docs/page-copy.md).
		copy: await pageCopy("idea-recorder-page", copyFallback, locals),
		fromSong:
			songId.success && fromSongAccount && editing.some((m) => m.accountId === fromSongAccount)
				? await songLink(fromSongAccount, songId.output)
				: null,
	};
};
