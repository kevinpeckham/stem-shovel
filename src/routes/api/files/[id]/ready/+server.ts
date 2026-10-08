import { accountOfFile, memberOf } from "#lib/server/access.js";
import { fileThumbnailPathname, isOurBlobUrl, putBlob, readBlob } from "#lib/server/blob.js";
import { failFile, findFileById, markFileReady } from "#lib/server/data.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import {
	FILE_KIND_LABELS,
	PDF_THUMBNAIL_MAX_BYTES,
	type FileKind,
} from "#lib/constants/fileFormats.js";
import {
	imageTypeOfBytes,
	isPdfBytes,
	looksLikeText,
	startsLikeAudio,
	startsLikeImage,
	startsLikeMidi,
} from "#lib/utils/fileSignatures.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 3 of an attachment upload (docs/uploads-and-blob.md, "Attachments"):
 * the browser reports the blob URL and, when it rendered one, the page
 * count and the first page as an image (a WebP or PNG; a PDF's). The
 * server reads the file's first bytes from the store and checks them
 * against the row's kind before believing the name (a browser's content
 * type is a claim): a PDF must start `%PDF-`, an image, an audio file or
 * a MIDI file with its own signature, a text file must decode as UTF-8
 * without a NUL byte; "other" is checked by size alone. Anything else is
 * removed, row and file. The thumbnail is checked by its bytes too, then
 * stored beside the file in the same store; an image without one is fine
 * (the page shows the image itself).
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const form = await request.formData();
	const url = form.get("url");
	if (typeof url !== "string" || !url.startsWith("https://")) error(400, "url is required");
	const pagesRaw = Number(form.get("pageCount"));
	const pageCount =
		Number.isInteger(pagesRaw) && pagesRaw > 0 && pagesRaw < 10_000 ? pagesRaw : null;
	const thumbnail = form.get("thumbnail");

	const { accountId } = await memberOf(locals, accountOfFile, params.id);
	const file = await findFileById(accountId, params.id);
	if (!file) error(404, "File not found");
	const { pathname, kind } = file;
	if (!isOurBlobUrl(url, pathname)) error(400, "That is not the uploaded file's URL");

	if (!(await startsLikeKind(url, kind))) {
		await failFile(accountId, params.id);
		error(
			415,
			`That file does not look like ${
				kind === "pdf"
					? "a PDF"
					: kind === "image"
						? "an image"
						: kind === "audio"
							? "audio"
							: kind === "text"
								? "text"
								: kind === "midi"
									? "MIDI"
									: `a ${FILE_KIND_LABELS[kind].toLowerCase()}`
			}`,
		);
	}

	let thumbnailUrl: string | null = null;
	let thumbnailPathname: string | null = null;
	if (thumbnail instanceof File && thumbnail.size > 0) {
		if (thumbnail.size > PDF_THUMBNAIL_MAX_BYTES) error(413, "The thumbnail is too large");
		const bytes = new Uint8Array(await thumbnail.arrayBuffer());
		const type = imageTypeOfBytes(bytes);
		if (type) {
			thumbnailPathname = fileThumbnailPathname(pathname, type === "image/webp" ? "webp" : "png");
			const put = await putBlob(
				thumbnailPathname,
				Buffer.from(bytes),
				type,
				await accessOfPathname(pathname),
			);
			thumbnailUrl = put.url;
		}
	}
	const row = await markFileReady(accountId, params.id, {
		url,
		pageCount,
		thumbnailUrl,
		thumbnailPathname,
	});
	if (!row) error(404, "File not found");
	return Response.json({ ok: true, shareCode: row.shareCode, kind: row.kind });
};

/** Whether the file as stored starts the way its kind should; "other" needs only to be there. */
async function startsLikeKind(url: string, kind: FileKind): Promise<boolean> {
	const head = await headOfBlob(url);
	if (!head) return false;
	switch (kind) {
		case "pdf":
			return isPdfBytes(head);
		case "image":
			return startsLikeImage(head);
		case "audio":
			return startsLikeAudio(head);
		case "midi":
			return startsLikeMidi(head);
		case "text":
			return looksLikeText(head);
		case "other":
			return head.length > 0;
	}
}

/** The first bytes of the file as stored (a second try a moment later: the CDN can lag a fresh upload). */
async function headOfBlob(url: string): Promise<Uint8Array | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await readBlob(url).catch(() => null);
		if (res?.ok && res.body) {
			const reader = res.body.getReader();
			const { value } = await reader.read();
			await reader.cancel().catch(() => {});
			return value ?? null;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return null;
}
