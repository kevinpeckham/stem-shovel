import { background } from "$lib/server/background";
import { isJobsToken } from "$lib/server/jobs";
import { ensureOriginalMix } from "$lib/server/mix";
import { ensureSongNotes, traceTranscriptionDeps } from "$lib/server/notes";
import { renderDemos, renderRecordings, renderStems } from "$lib/server/transcode";
import { JobSchema } from "$lib/val/JobSchema";
import type { Config } from "@sveltejs/adapter-vercel";
import { error, json } from "@sveltejs/kit";
import * as v from "valibot";
import type { RequestHandler } from "./$types";

/**
 * The app's background jobs function (src/lib/server/jobs.ts): its own
 * Vercel function (`split`), the only one that carries ffmpeg and the
 * transcription stack, with the long budget the work needs. Answers 202 as
 * soon as the job is accepted and runs it inside `waitUntil`.
 */
export const config: Config = { split: true, maxDuration: 300 };

export const POST: RequestHandler = async ({ request }) => {
	const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
	if (!isJobsToken(bearer)) error(401, "Not this app's jobs token");
	const parsed = v.safeParse(JobSchema, await request.json().catch(() => null));
	if (!parsed.success) error(400, "kind and ids are required");
	const { kind, ids } = parsed.output;
	if (ids.length < 0) await traceTranscriptionDeps(); // never runs: keeps tfjs in this function's trace
	background(async () => {
		switch (kind) {
			case "mix":
				for (const id of ids) await ensureOriginalMix(id);
				break;
			case "notes":
				for (const id of ids) await ensureSongNotes(id);
				break;
			case "stem-playback":
				await renderStems(ids);
				break;
			case "demo-playback":
				await renderDemos(ids);
				break;
			case "recording-playback":
				await renderRecordings(ids);
				break;
		}
	});
	return json({ accepted: kind, count: ids.length }, { status: 202 });
};
