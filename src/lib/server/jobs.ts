import { background } from "$lib/server/background";
import type { JobKind } from "$lib/val/JobSchema";
import { dev } from "$app/environment";
import { getRequestEvent } from "$app/server";
import { ENV } from "varlock/env";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Background work (renditions, mixes, notes) runs in the app's own jobs
 * function, `POST /api/jobs`, not in the function that served the page: the
 * page functions then never load ffmpeg or the transcription stack, which
 * keeps their cold starts short and their bundles small (docs/environment.md
 * "Cold starts"). The scheduler posts the job after the response
 * (`background`); the jobs route answers 202 at once and does the work in
 * its own `waitUntil`. The route is for this app only: the caller proves
 * itself with a token derived from the auth secret, so no extra secret is
 * configured per stage. In development the dev server serves both sides.
 */
function jobsToken(): string {
	return createHmac("sha256", ENV.BETTER_AUTH_SECRET).update("background-jobs").digest("hex");
}

/** Whether a bearer token is this app's jobs token, in constant time. */
export function isJobsToken(bearer: string | null): boolean {
	const expected = Buffer.from(jobsToken());
	const given = Buffer.from(bearer ?? "");
	return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The origin to call back on: the current request's, else the site's own. */
function originOfRequest(): string {
	// The dev server is reached through proxies whose origin it cannot call back; it listens on localhost.
	if (dev) return "http://localhost:5173";
	try {
		return getRequestEvent().url.origin;
	} catch {
		const host = ENV.VERCEL_PROJECT_PRODUCTION_URL;
		return host ? `https://${host}` : "http://localhost:5173";
	}
}

function scheduleJob(kind: JobKind, ids: string[]) {
	const unique = [...new Set(ids)];
	if (unique.length === 0) return;
	const origin = originOfRequest();
	background(async () => {
		const res = await fetch(`${origin}/api/jobs`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${jobsToken()}` },
			body: JSON.stringify({ kind, ids: unique }),
		});
		if (!res.ok) throw new Error(`jobs: ${kind} for ${unique.length} answered ${res.status}`);
	});
}

/** Renders the songs' original mixes, one after another. */
export const scheduleMix = (songIds: string[]) => scheduleJob("mix", songIds);
/** Transcribes the songs' notes for the chart draft (each picks up where it left off). */
export const scheduleNotes = (songIds: string[]) => scheduleJob("notes", songIds);
/** Renders the stems' playback renditions, then their songs' mixes and notes. */
export const schedulePlayback = (stemIds: string[]) => scheduleJob("stem-playback", stemIds);
/** Demo recordings become MP3s. */
export const scheduleDemoPlayback = (demoIds: string[]) => scheduleJob("demo-playback", demoIds);
/** Takes (docs/demo-recording.md) get the same MP3. */
export const scheduleRecordingPlayback = (recordingIds: string[]) =>
	scheduleJob("recording-playback", recordingIds);
