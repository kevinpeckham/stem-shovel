import { accountOfSessionRecording, memberOf } from "#lib/server/access.js";
import { readBlob } from "#lib/server/blob.js";
import { sessionRecordingFile } from "#lib/server/data.js";
import { renderWithEq } from "#lib/server/eqRender.js";
import { SESSION_DEVICE_LABELS } from "#lib/constants/sessionRecordings.js";
import { attachmentDisposition } from "#lib/utils/attachmentDisposition.js";
import { eqFilterGraph } from "#lib/utils/eqFilterGraph.js";
import { parseEqSearchParams } from "#lib/utils/eqSearchParams.js";
import { recordingDownloadName } from "#lib/utils/recordingDownloadName.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** The recording is read from Blob and encoded through ffmpeg in the request. */
export const config: Config = { maxDuration: 300 };

/**
 * A session recording as an MP3 with the playback EQ applied
 * (docs/uploads-and-blob.md, "Sessions"); a member of the account. The
 * settings come in the query (`utils/eqSearchParams.ts`: `hp=1`,
 * `<band>=<dB>`, `<band>f=<Hz>`); flat settings are a 400, since the MP3
 * itself is that download. Encoded from the MP3 rendition when there is
 * one, the original otherwise, and streamed as ffmpeg writes it.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	const { accountId } = await memberOf(locals, accountOfSessionRecording, params.id);
	const r = await sessionRecordingFile(accountId, params.id);
	if (!r) error(404, "Not found");
	const graph = eqFilterGraph(parseEqSearchParams(url.searchParams));
	if (!graph) error(400, "The EQ is flat: download the MP3 itself.");
	const res = await readBlob(r.playbackUrl ?? r.url);
	if (!res.ok || !res.body) error(500, "Could not read the recording.");
	let body: ReadableStream<Uint8Array>;
	try {
		body = await renderWithEq(res, graph);
	} catch (e) {
		console.error("eq.mp3: render failed", e);
		error(500, "Could not apply the EQ to this recording.");
	}
	const name = recordingDownloadName(
		r.title,
		r.filename,
		"mp3",
		r.source,
		SESSION_DEVICE_LABELS[r.device],
	).replace(/\.mp3$/, " (EQ).mp3");
	return new Response(body, {
		headers: {
			"content-type": "audio/mpeg",
			"content-disposition": attachmentDisposition(name),
			"cache-control": "private, no-store",
		},
	});
};
