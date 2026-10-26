import { accountOfRecordingSession, memberOf } from "#lib/server/access.js";
import { readBlob } from "#lib/server/blob.js";
import { sessionMp3s } from "#lib/server/data.js";
import { attachmentDisposition } from "#lib/utils/attachmentDisposition.js";
import { SESSION_DEVICE_LABELS } from "#lib/constants/sessionRecordings.js";
import { recordingDownloadName } from "#lib/utils/recordingDownloadName.js";
import { sessionDisplayName } from "#lib/utils/sessionName.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import { Zip, ZipPassThrough } from "fflate";
import type { RequestHandler } from "./$types";

/** Every MP3 is read from Blob and streamed into the zip in the request. */
export const config: Config = { maxDuration: 300 };

/**
 * A session's recordings as MP3s in one zip (docs/uploads-and-blob.md,
 * "Sessions"), numbered in the order they were made ("01 Set one.mp3"),
 * named after the session; a member of the account. Stored, not
 * compressed (MP3 does not shrink), and streamed file by file so an
 * evening of recordings never sits in memory at once. 404 until at least
 * one MP3 has rendered.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { accountId } = await memberOf(locals, accountOfRecordingSession, params.id);
	const found = await sessionMp3s(accountId, params.id);
	if (!found) error(404, "Not found");
	const { session, recordings } = found;
	if (recordings.length === 0) error(404, "No MP3 of this session is ready yet.");
	const name = sessionDisplayName(session);
	const width = String(recordings.length).length;
	const zip = new Zip();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			zip.ondata = (err, chunk, final) => {
				if (err) controller.error(err);
				else {
					controller.enqueue(chunk);
					if (final) controller.close();
				}
			};
			void (async () => {
				try {
					for (const [i, r] of recordings.entries()) {
						const entry = new ZipPassThrough(
							`${String(i + 1).padStart(width, "0")}-${recordingDownloadName(r.title, r.filename, "mp3", r.source, SESSION_DEVICE_LABELS[r.device])}`,
						);
						zip.add(entry);
						const res = await readBlob(r.playbackUrl!);
						if (!res.ok || !res.body) throw new Error(`Could not read ${r.filename}`);
						for await (const piece of res.body) entry.push(piece);
						entry.push(new Uint8Array(0), true);
					}
					zip.end();
				} catch (e) {
					controller.error(e);
				}
			})();
		},
	});
	return new Response(stream, {
		headers: {
			"content-type": "application/zip",
			"content-disposition": attachmentDisposition(`${name} MP3s.zip`),
			"cache-control": "private, no-store",
		},
	});
};
