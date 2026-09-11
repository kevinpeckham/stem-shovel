import { findUploadingStem, recordStemUrl } from "$lib/server/data";
import { blobAuth } from "$lib/server/blob";
import { STEM_MAX_BYTES } from "$lib/slug";
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
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as HandleUploadBody;
	try {
		const result = await handleUpload({
			body,
			request,
			...blobAuth(),
			onBeforeGenerateToken: async (pathname) => {
				const row = await findUploadingStem(locals.account.id, pathname);
				if (!row) throw new Error(`No reserved stem for "${pathname}"`);
				return {
					allowedContentTypes: [row.contentType], // decided from the extension at reserve time
					maximumSizeInBytes: STEM_MAX_BYTES,
					addRandomSuffix: false,
					allowOverwrite: true, // a retry of the same reservation replaces the partial blob
					tokenPayload: JSON.stringify({ stemId: row.id }),
				};
			},
			onUploadCompleted: async ({ blob }) => {
				// Vercel calls this after the browser finishes — in production only,
				// it cannot reach localhost. The browser normally reports first via
				// /api/stems/[id]/ready; this is the backstop if that never arrives.
				await recordStemUrl(blob.pathname, blob.url);
			},
		});
		return json(result);
	} catch (err) {
		// 400 so Vercel's completion webhook retries are not triggered for our own errors.
		return json({ error: (err as Error).message }, { status: 400 });
	}
};
