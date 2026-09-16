import { accountOfUploadPathname, memberOf } from "$lib/server/access";
import {
	findStemByMidiPathname,
	findUploadingDemo,
	findUploadingStem,
	recordDemoUrl,
	recordStemMidiUrl,
	recordStemUrl,
} from "$lib/server/data";
import { blobAuth, songIdOfPathname } from "$lib/server/blob";
import { accessOfSongId } from "$lib/server/relocate";
import { MIDI_MAX_BYTES } from "$lib/constants/midiFormats";
import { STEM_MAX_BYTES } from "$lib/constants/stemFormats";
import { json } from "@sveltejs/kit";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { RequestHandler } from "./$types";

/**
 * Step 2 of an upload, per https://vercel.com/docs/vercel-blob/client-upload.
 * The browser calls `upload()` with this route as `handleUploadUrl`; we only
 * issue a token for a pathname that /api/stems reserved for this account.
 *
 * Authorization is "whoever locals says you are" until real auth exists.
 */
const isDemo = (pathname: string) => pathname.includes("/demos/");
const isMidi = (pathname: string) => pathname.includes("/midi/");

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as HandleUploadBody;
	try {
		// The store (and so the token) follows the song's privacy; the pathname names the song.
		const pathname =
			body.type === "blob.generate-client-token"
				? body.payload.pathname
				: body.payload.blob.pathname;
		const songId = songIdOfPathname(pathname);
		const access = (songId && (await accessOfSongId(songId))) || "public";
		const result = await handleUpload({
			body,
			request,
			...blobAuth(access),
			onBeforeGenerateToken: async (pathname) => {
				const { accountId } = await memberOf(locals, accountOfUploadPathname, pathname);
				// Stems and demo recordings share this route; the reservation decides which.
				const row = isMidi(pathname)
					? await findStemByMidiPathname(accountId, pathname)
					: isDemo(pathname)
						? await findUploadingDemo(accountId, pathname)
						: await findUploadingStem(accountId, pathname);
				if (!row) throw new Error(`No reservation for "${pathname}"`);
				return {
					// decided from the extension at reserve time; MIDI is always audio/midi
					allowedContentTypes: ["contentType" in row ? row.contentType : "audio/midi"],
					maximumSizeInBytes: isMidi(pathname) ? MIDI_MAX_BYTES : STEM_MAX_BYTES,
					addRandomSuffix: false,
					allowOverwrite: true, // a retry of the same reservation replaces the partial blob
					tokenPayload: JSON.stringify({ id: row.id }),
				};
			},
			onUploadCompleted: async ({ blob }) => {
				// Vercel calls this after the browser finishes — in production only,
				// it cannot reach localhost. The browser normally reports first via
				// /api/stems/[id]/ready; this is the backstop if that never arrives.
				if (isMidi(blob.pathname)) await recordStemMidiUrl(blob.pathname, blob.url);
				else if (isDemo(blob.pathname)) await recordDemoUrl(blob.pathname, blob.url);
				else await recordStemUrl(blob.pathname, blob.url);
			},
		});
		return json(result);
	} catch (err) {
		// 400 so Vercel's completion webhook retries are not triggered for our own errors.
		return json({ error: (err as Error).message }, { status: 400 });
	}
};
