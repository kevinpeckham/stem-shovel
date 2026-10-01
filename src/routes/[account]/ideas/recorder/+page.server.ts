import { publicBlobUrl } from "$lib/server/blob";
import { requireEditor, requireSignedIn } from "$lib/server/access";
import { aiAvailable } from "$lib/server/aiDetect";
import {
	deleteEmptyIdeas,
	listBeats,
	listIdeas,
	listPianoPresets,
	recordingsWantingPlayback,
	songLink,
	sitePianoPresets,
	songPicker,
} from "$lib/server/data";
import { scheduleRecordingPlayback } from "$lib/server/jobs";
import { IdeaInstrumentsDataSchema } from "$lib/val/IdeaSchema";
import { NanoIdSchema } from "$lib/val/NanoIdSchema";
import type { Config } from "@sveltejs/adapter-vercel";
import * as v from "valibot";
import type { PageServerLoad } from "./$types";

/** An empty idea younger than this may still have its first take uploading. */
const EMPTY_IDEA_GRACE_MS = 60 * 60 * 1000;

/** Missing MP3s render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/**
 * The Idea Recorder (docs/demo-recording.md): members only; `?song=<id>`
 * remembers where it was opened from. The user's own ideas come along with
 * their takes' metadata (a URL to play on demand, never the audio itself).
 */
function parseInstruments(json: string | null) {
	if (!json) return null;
	try {
		const r = v.safeParse(IdeaInstrumentsDataSchema, JSON.parse(json));
		return r.success ? r.output : null;
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const user = requireSignedIn(locals, url);
	const { account } = await parent();
	requireEditor(locals, account.id);
	const songParam = url.searchParams.get("song");
	const songId = v.safeParse(NanoIdSchema, songParam ?? "");
	// Ideas that never got a take or notes are not worth listing; sweep the old ones.
	await deleteEmptyIdeas(account.id, user.id, EMPTY_IDEA_GRACE_MS);
	const ideas = await listIdeas(account.id, user.id);
	scheduleRecordingPlayback(recordingsWantingPlayback(ideas.flatMap((i) => i.takes)));
	return {
		// The piano under the recorder: where this stage keeps the Grand Piano's fuller sample tiers.
		pianoSamplesBase: publicBlobUrl("piano/v1"),
		ideas: ideas.map((i) => ({
			id: i.id,
			title: i.title,
			notes: i.notes,
			// The instruments as they were with the idea (JSON in the row); a row from before the column, or one that fails the schema, loads nothing.
			instruments: parseInstruments(i.instruments),
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
			})),
		})),
		projects: await songPicker(account.id),
		// The drum machine's panel (docs/demo-recording.md): the account's saved beats and whether Text-to-Beat is on.
		beats: await listBeats(account.id),
		textToBeat: aiAvailable(),
		// The piano's panel: the site's demo presets and the account's own, as the piano page has them (Kevin: the preset buttons were missing from the panel).
		sitePresets: await sitePianoPresets(),
		pianoPresets: await listPianoPresets(account.id),
		presetAdmin: locals.user?.isSystemAdmin === true,
		fromSong: songId.success ? await songLink(account.id, songId.output) : null,
	};
};
