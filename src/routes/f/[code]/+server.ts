import { presentUrl, readBlob } from "$lib/server/blob";
import { notationByShareCode, pdfByShareCode } from "$lib/server/data";
import { NOTATION_CONTENT_TYPE_OF } from "$lib/constants/notationFormats";
import { attachmentDisposition } from "$lib/utils/attachmentDisposition";
import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * A file's permanent link (docs/uploads-and-blob.md, "PDFs" and "Notation
 * files"): `/f/<code>` finds the file by its share code (a PDF's first,
 * then a notation file's) and sends the visitor to where it is now, in
 * either store (a presigned URL, good for twelve hours, for a private
 * song's), so the link outlives renames and privacy moves. With
 * `?download=1` it streams the file instead, as an attachment under its
 * own name (the store's own download switch would name it by its id). The
 * code is the secret; a code nobody made is a 404.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const file = await fileByShareCode(params.code);
	if (!file) error(404, "This link is not one Stem Shovel made.");
	if (url.searchParams.get("download")) {
		const res = await readBlob(file.url);
		if (!res.ok || !res.body) error(404, "The file is gone.");
		const headers = new Headers({
			"content-type": file.contentType,
			"content-disposition": attachmentDisposition(file.filename),
			"cache-control": "private, no-store",
		});
		const length = res.headers.get("content-length");
		if (length) headers.set("content-length", length);
		return new Response(res.body, { status: 200, headers });
	}
	const presented = await presentUrl(file.url);
	if (!presented) error(404, "The file is gone.");
	redirect(302, presented);
};

/** Whichever ready file carries the code, with the type to serve it as. */
async function fileByShareCode(
	code: string,
): Promise<{ url: string; filename: string; contentType: string } | null> {
	const pdf = await pdfByShareCode(code);
	if (pdf) return { url: pdf.url, filename: pdf.filename, contentType: "application/pdf" };
	const notation = await notationByShareCode(code);
	if (notation) {
		return {
			url: notation.url,
			filename: notation.filename,
			contentType: NOTATION_CONTENT_TYPE_OF[notation.format],
		};
	}
	return null;
}
