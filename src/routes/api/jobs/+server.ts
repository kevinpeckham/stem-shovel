import { background } from "#lib/server/background.js";
import { isJobsToken } from "#lib/server/jobs.js";
import { traceTranscriptionDeps } from "#lib/server/notes.js";
import { JobSchema } from "#lib/val/JobSchema.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { RUNNERS } from "./runners";

/**
 * The app's background jobs function (src/lib/server/jobs.ts): its own
 * Vercel function (`split`), the only one that carries ffmpeg, the
 * transcription stack and the notation engraver, with the long budget the
 * work needs. Answers 202 as soon as the job is accepted and runs it inside
 * `waitUntil`.
 */
/** 800 s, the Pro plan's ceiling: a whole show's recording (hours of FLAC) is decoded, measured and encoded here (docs/environment.md). */
export const config: Config = { split: true, maxDuration: 800 };

export const POST: RequestHandler = async ({ request }) => {
	const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
	if (!isJobsToken(bearer)) error(401, "Not this app's jobs token");
	const parsed = v.safeParse(JobSchema, await request.json().catch(() => null));
	if (!parsed.success) error(400, "kind and ids are required");
	const { kind, ids } = parsed.output;
	if (ids.length < 0) await traceTranscriptionDeps(); // never runs: keeps tfjs in this function's trace
	background(() => RUNNERS[kind](ids), { kind, count: ids.length });
	return Response.json({ accepted: kind, count: ids.length }, { status: 202 });
};
