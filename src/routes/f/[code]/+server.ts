import { presentUrl, readBlob } from "$lib/server/blob";
import { pdfByShareCode } from "$lib/server/data";
import { attachmentDisposition } from "$lib/utils/attachmentDisposition";
import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * A PDF's permanent link (docs/uploads-and-blob.md, "PDFs"): `/f/<code>`
 * finds the file by its share code and sends the visitor to where it is
 * now, in either store (a presigned URL, good for twelve hours, for a
 * private song's), so the link outlives renames and privacy moves. With
 * `?download=1` it streams the file instead, as an attachment under its
 * own name (the store's own download switch would name it by its id). The
 * code is the secret; a code nobody made is a 404.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const pdf = await pdfByShareCode(params.code);
	if (!pdf) error(404, "This link is not one Stem Shovel made.");
	if (url.searchParams.get("download")) {
		const file = await readBlob(pdf.url);
		if (!file.ok || !file.body) error(404, "The file is gone.");
		const headers = new Headers({
			"content-type": "application/pdf",
			"content-disposition": attachmentDisposition(pdf.filename),
			"cache-control": "private, no-store",
		});
		const length = file.headers.get("content-length");
		if (length) headers.set("content-length", length);
		return new Response(file.body, { status: 200, headers });
	}
	const presented = await presentUrl(pdf.url);
	if (!presented) error(404, "The file is gone.");
	redirect(302, presented);
};
