import { accountOfPdf, memberOf } from "$lib/server/access";
import { isOurBlobUrl, pdfThumbnailPathname, putBlob, readBlob } from "$lib/server/blob";
import { failPdf, markPdfReady, reservedPathname } from "$lib/server/data";
import { accessOfPathname } from "$lib/server/relocate";
import { PDF_THUMBNAIL_MAX_BYTES } from "$lib/constants/pdfFormats";
import { imageTypeOfBytes, isPdfBytes } from "$lib/utils/fileSignatures";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 3 of a PDF upload (docs/uploads-and-blob.md, "PDFs"): the browser
 * reports the blob URL, the page count it read and the first page it
 * rendered (a WebP or PNG). The server reads the file's first bytes from
 * the store before believing it is a PDF (a browser's content type is a
 * claim); anything else is removed, row and file. The thumbnail is checked
 * by its bytes too, then stored beside the file in the same store.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const form = await request.formData();
	const url = form.get("url");
	if (typeof url !== "string" || !url.startsWith("https://")) error(400, "url is required");
	const pagesRaw = Number(form.get("pageCount"));
	const pageCount =
		Number.isInteger(pagesRaw) && pagesRaw > 0 && pagesRaw < 10_000 ? pagesRaw : null;
	const thumbnail = form.get("thumbnail");

	const { accountId } = await memberOf(locals, accountOfPdf, params.id);
	const pathname = await reservedPathname(accountId, "pdf", params.id);
	if (!pathname || !isOurBlobUrl(url, pathname)) error(400, "That is not the uploaded file's URL");

	if (!(await startsLikePdf(url))) {
		await failPdf(accountId, params.id);
		error(415, "That file is not a PDF");
	}

	let thumbnailUrl: string | null = null;
	let thumbnailPathname: string | null = null;
	if (thumbnail instanceof File && thumbnail.size > 0) {
		if (thumbnail.size > PDF_THUMBNAIL_MAX_BYTES) error(413, "The thumbnail is too large");
		const bytes = new Uint8Array(await thumbnail.arrayBuffer());
		const type = imageTypeOfBytes(bytes);
		if (type) {
			const songId = pathname.split("/")[3]!;
			thumbnailPathname = pdfThumbnailPathname(
				accountId,
				songId,
				params.id,
				type === "image/webp" ? "webp" : "png",
			);
			const put = await putBlob(
				thumbnailPathname,
				Buffer.from(bytes),
				type,
				await accessOfPathname(pathname),
			);
			thumbnailUrl = put.url;
		}
	}
	const row = await markPdfReady(accountId, params.id, {
		url,
		pageCount,
		thumbnailUrl,
		thumbnailPathname,
	});
	if (!row) error(404, "PDF not found");
	return json({ ok: true, shareCode: row.shareCode });
};

/** The first bytes of the file as stored (a second try a moment later: the CDN can lag a fresh upload). */
async function startsLikePdf(url: string): Promise<boolean> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await readBlob(url).catch(() => null);
		if (res?.ok && res.body) {
			const reader = res.body.getReader();
			const { value } = await reader.read();
			await reader.cancel().catch(() => {});
			return !!value && isPdfBytes(value);
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return false;
}
