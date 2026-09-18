import { requireMember, requireSignedIn } from "$lib/server/access";
import { listRecordings, recordingsWantingPlayback, songLink, songPicker } from "$lib/server/data";
import { scheduleRecordingPlayback } from "$lib/server/transcode";
import type { Config } from "@sveltejs/adapter-vercel";
import { NanoIdSchema } from "$lib/val/NanoIdSchema";
import * as v from "valibot";
import type { PageServerLoad } from "./$types";

/** Missing MP3s render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/**
 * The idea recorder (docs/demo-recording.md): members only; `?song=<id>`
 * remembers where it was opened from. The account's recordings come along
 * as metadata (title, length, notes, a URL to play on demand), for the
 * list under the recorder.
 */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	const songParam = url.searchParams.get("song");
	const songId = v.safeParse(NanoIdSchema, songParam ?? "");
	const recordings = await listRecordings(account.id);
	scheduleRecordingPlayback(recordingsWantingPlayback(recordings));
	return {
		recordings: recordings.map((r) => ({
			id: r.id,
			title: r.title,
			notes: r.notes,
			url: r.playbackUrl ?? r.url,
			durationSeconds: r.durationSeconds,
			createdAt: r.createdAt,
		})),
		projects: await songPicker(account.id),
		fromSong: songId.success ? await songLink(account.id, songId.output) : null,
	};
};
