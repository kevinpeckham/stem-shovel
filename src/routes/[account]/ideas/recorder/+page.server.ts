import { requireMember, requireSignedIn } from "$lib/server/access";
import {
	deleteEmptyIdeas,
	listIdeas,
	recordingsWantingPlayback,
	songLink,
	songPicker,
} from "$lib/server/data";
import { scheduleRecordingPlayback } from "$lib/server/jobs";
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
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const user = requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	const songParam = url.searchParams.get("song");
	const songId = v.safeParse(NanoIdSchema, songParam ?? "");
	// Ideas that never got a take or notes are not worth listing; sweep the old ones.
	await deleteEmptyIdeas(account.id, user.id, EMPTY_IDEA_GRACE_MS);
	const ideas = await listIdeas(account.id, user.id);
	scheduleRecordingPlayback(recordingsWantingPlayback(ideas.flatMap((i) => i.takes)));
	return {
		ideas: ideas.map((i) => ({
			id: i.id,
			title: i.title,
			notes: i.notes,
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
		fromSong: songId.success ? await songLink(account.id, songId.output) : null,
	};
};
