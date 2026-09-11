import { SLUG_PATTERN, STEM_CONTENT_TYPES, STEM_MAX_BYTES, STEM_PREFIX } from "$lib/slug";
import { json } from "@sveltejs/kit";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ENV } from "varlock/env";
import type { RequestHandler } from "./$types";

/**
 * Browser → Blob direct upload, per https://vercel.com/docs/vercel-blob/client-upload.
 * The client calls `upload()` from `@vercel/blob/client` with this route as
 * `handleUploadUrl`; we hand back a short-lived token scoped to one pathname.
 *
 * There is no auth yet — anyone who can reach this route can upload. That is
 * acceptable for a Tailscale-only PoC and must change before the app is public.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as HandleUploadBody;
	try {
		const result = await handleUpload({
			body,
			request,
			token: ENV.BLOB_READ_WRITE_TOKEN,
			onBeforeGenerateToken: async (pathname) => {
				const [prefix, slug, file, ...rest] = pathname.split("/");
				if (
					`${prefix}/` !== STEM_PREFIX ||
					!SLUG_PATTERN.test(slug ?? "") ||
					!file ||
					rest.length
				) {
					throw new Error(`Refusing pathname "${pathname}": expected ${STEM_PREFIX}<slug>/<file>`);
				}
				return {
					allowedContentTypes: STEM_CONTENT_TYPES,
					maximumSizeInBytes: STEM_MAX_BYTES,
					addRandomSuffix: false,
					allowOverwrite: true, // re-uploading a stem replaces it
					tokenPayload: JSON.stringify({ slug }),
				};
			},
			onUploadCompleted: async ({ blob }) => {
				// Vercel calls this after the browser finishes. It cannot reach
				// localhost, so in dev it never fires. Step 4 (Turso) records the
				// stem here; for now the song page lists the store directly.
				console.log("[blob] upload completed", blob.pathname, blob.url);
			},
		});
		return json(result);
	} catch (err) {
		// 400 so Vercel's completion webhook retries are not triggered for our own errors.
		return json({ error: (err as Error).message }, { status: 400 });
	}
};
