import { requireMember, requireSignedIn } from "$lib/server/access";
import { listRecordings, recordingsWantingPlayback, songPicker } from "$lib/server/data";
import { scheduleRecordingPlayback } from "$lib/server/transcode";
import type { Config } from "@sveltejs/adapter-vercel";
import type { PageServerLoad } from "./$types";

/** Missing MP3s render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/** The account's scratch recordings (docs/demo-recording.md): members only. */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	const recordings = await listRecordings(account.id);
	scheduleRecordingPlayback(recordingsWantingPlayback(recordings));
	return {
		recordings: recordings.map((r) => ({
			id: r.id,
			title: r.title,
			notes: r.notes,
			url: r.url,
			playbackUrl: r.playbackUrl,
			playbackStatus: r.playbackStatus,
			sizeBytes: r.sizeBytes,
			durationSeconds: r.durationSeconds,
			createdAt: r.createdAt,
			recordedBy: r.recorder?.name ?? null,
		})),
		projects: await songPicker(account.id),
	};
};
