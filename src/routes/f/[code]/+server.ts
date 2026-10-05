import { presentUrl } from "$lib/server/blob";
import { pdfByShareCode } from "$lib/server/data";
import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * A PDF's permanent link (docs/uploads-and-blob.md, "PDFs"): `/f/<code>`
 * finds the file by its share code and sends the visitor to where it is
 * now, in either store (a presigned URL, good for twelve hours, for a
 * private song's), so the link outlives renames and privacy moves. The
 * code is the secret; a code nobody made is a 404.
 */
export const GET: RequestHandler = async ({ params }) => {
	const pdf = await pdfByShareCode(params.code);
	if (!pdf) error(404, "This link is not one Stem Shovel made.");
	const url = await presentUrl(pdf.url);
	if (!url) error(404, "The file is gone.");
	redirect(302, url);
};
