import { accountOfNotation, memberOf } from "#lib/server/access.js";
import { isOurBlobUrl, notationThumbnailPathname, putBlob, readBlob } from "#lib/server/blob.js";
import { failNotation, markNotationReady, reservedPathname } from "#lib/server/data.js";
import { scheduleNotationPdf } from "#lib/server/jobs.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { NOTATION_THUMBNAIL_MAX_BYTES, notationFormatOf } from "#lib/constants/notationFormats.js";
import { imageTypeOfBytes, startsLikeMusicXml, startsLikeZip } from "#lib/utils/fileSignatures.js";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** How much of the file the signature check wants (`startsLikeMusicXml` reads this far). */
const HEAD_BYTES = 4096;

/**
 * Step 3 of a notation upload (docs/uploads-and-blob.md, "Notation
 * files"): the browser reports the blob URL, the page count Verovio laid
 * out and the first page it rendered (a WebP or PNG), both optional. The
 * server reads the file's first bytes from the store before believing it
 * is what its name says (a browser's content type is a claim): a zip
 * signature for `.mxl`, an XML prologue naming a score for the rest; it
 * never parses the XML. Anything else is removed, row and file. The
 * thumbnail is checked by its bytes too, then stored beside the file in
 * the same store. The row ready, the jobs function is asked for the PDF
 * (src/lib/server/notationPdf.ts).
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const form = await request.formData();
	const url = form.get("url");
	if (typeof url !== "string" || !url.startsWith("https://")) error(400, "url is required");
	const pagesRaw = Number(form.get("pageCount"));
	const pageCount =
		Number.isInteger(pagesRaw) && pagesRaw > 0 && pagesRaw < 10_000 ? pagesRaw : null;
	const thumbnail = form.get("thumbnail");

	const { accountId } = await memberOf(locals, accountOfNotation, params.id);
	const pathname = await reservedPathname(accountId, "notation", params.id);
	if (!pathname || !isOurBlobUrl(url, pathname)) error(400, "That is not the uploaded file's URL");
	// The pathname keeps the extension the row's format came from (blob.ts, notationPathname).
	const format = notationFormatOf(pathname) ?? "musicxml";

	const head = await blobHead(url);
	const looksRight = head && (format === "mxl" ? startsLikeZip(head) : startsLikeMusicXml(head));
	if (!looksRight) {
		await failNotation(accountId, params.id);
		error(
			415,
			format === "mxl"
				? "That file is not a compressed MusicXML file"
				: "That file is not MusicXML",
		);
	}

	let thumbnailUrl: string | null = null;
	let thumbnailPathname: string | null = null;
	if (thumbnail instanceof File && thumbnail.size > 0) {
		if (thumbnail.size > NOTATION_THUMBNAIL_MAX_BYTES) error(413, "The thumbnail is too large");
		const bytes = new Uint8Array(await thumbnail.arrayBuffer());
		const type = imageTypeOfBytes(bytes);
		if (type) {
			const songId = pathname.split("/")[3]!;
			thumbnailPathname = notationThumbnailPathname(
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
	const row = await markNotationReady(accountId, params.id, {
		url,
		pageCount,
		thumbnailUrl,
		thumbnailPathname,
	});
	if (!row) error(404, "Notation file not found");
	scheduleNotationPdf(row.id);
	return json({ ok: true, shareCode: row.shareCode });
};

/**
 * The first bytes of the file as stored, enough for the signature check or
 * all of it when it is shorter (a second try a moment later: the CDN can
 * lag a fresh upload). Null when the store has nothing to read.
 */
async function blobHead(url: string): Promise<Uint8Array | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await readBlob(url).catch(() => null);
		if (res?.ok && res.body) {
			const reader = res.body.getReader();
			const chunks: Uint8Array[] = [];
			let length = 0;
			while (length < HEAD_BYTES) {
				const { value, done } = await reader.read();
				if (done || !value) break;
				chunks.push(value);
				length += value.length;
			}
			await reader.cancel().catch(() => {});
			const head = new Uint8Array(length);
			let offset = 0;
			for (const c of chunks) {
				head.set(c, offset);
				offset += c.length;
			}
			return head;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return null;
}
