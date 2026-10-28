import { presentUrl, readBlob } from "#lib/server/blob.js";
import {
	fileByShareCode as attachmentByShareCode,
	eventFileByShareCode,
	notationByShareCode,
} from "#lib/server/data.js";
import { NOTATION_CONTENT_TYPE_OF } from "#lib/constants/notationFormats.js";
import { attachmentDisposition } from "#lib/utils/attachmentDisposition.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** A file in a store and the name and type to send it as. */
interface Served {
	url: string;
	filename: string;
	contentType: string;
}

/**
 * A file's permanent link (docs/uploads-and-blob.md, "Attachments" and
 * "Notation files"; docs/band-plan.md, "Posters, pictures and video"):
 * `/f/<code>` finds the file by its share code (an attachment's first, then
 * a notation file's, then a show's poster or photo) and sends the visitor to where it is now, in
 * either store (a presigned URL, good for twelve hours, for a private
 * song's), so the link outlives renames and privacy moves. With
 * `?download=1` it streams the file instead, as an attachment under its
 * own name (the store's own download switch would name it by its id),
 * with the content type its name says (an attachment's table stores none).
 * `?download=pdf` streams the file as a PDF: the PDF itself, or the one
 * the jobs function engraved from a notation file, named after it; a
 * notation file whose PDF is not ready is a 404. The code is the secret;
 * a code nobody made is a 404.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const file = await fileByShareCode(params.code);
	if (!file) error(404, "This link is not one Stem Shovel made.");
	const download = url.searchParams.get("download");
	if (download === "pdf") {
		if (!file.pdf) error(404, "There is no PDF of this file yet.");
		return stream(file.pdf);
	}
	if (download) return stream(file);
	const presented = await presentUrl(file.url);
	if (!presented) error(404, "The file is gone.");
	// A plain 302 to the store: SvelteKit 3's redirect() refuses an external address (the dev server answered 500; Kevin).
	return new Response(null, {
		status: 302,
		headers: { location: presented, "cache-control": "private, no-store" },
	});
};

/** The file as an attachment, straight from the store. */
async function stream(file: Served): Promise<Response> {
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

/** Whichever ready file carries the code, with the type to serve it as, and the PDF of it when there is one. */
async function fileByShareCode(code: string): Promise<(Served & { pdf: Served | null }) | null> {
	const file = await attachmentByShareCode(code);
	if (file) {
		const served = { url: file.url, filename: file.filename, contentType: file.contentType };
		return { ...served, pdf: file.kind === "pdf" ? served : null };
	}
	const notation = await notationByShareCode(code);
	if (notation) {
		return {
			url: notation.url,
			filename: notation.filename,
			contentType: NOTATION_CONTENT_TYPE_OF[notation.format],
			pdf:
				notation.pdfStatus === "ready" && notation.pdfUrl
					? {
							url: notation.pdfUrl,
							filename: `${notation.filename.replace(/\.[a-z0-9]+$/i, "")}.pdf`,
							contentType: "application/pdf",
						}
					: null,
		};
	}
	// A show's or practice's poster or photo: the type it was stored with; a PDF poster is its own PDF.
	const eventFile = await eventFileByShareCode(code);
	if (eventFile) {
		const served = {
			url: eventFile.url,
			filename: eventFile.filename,
			contentType: eventFile.contentType,
		};
		return { ...served, pdf: eventFile.contentType === "application/pdf" ? served : null };
	}
	return null;
}
