import { command, getRequestEvent } from "$app/server";
import { accountOfPdf, memberOf } from "$lib/server/access";
import { deletePdf as removePdf, updatePdf as savePdf } from "$lib/server/data";
import { IdSchema } from "$lib/val/SongSchema";
import { SongPdfUpdateSchema } from "$lib/val/SongPdfSchema";
import { error } from "@sveltejs/kit";

/** A PDF's title and description, and whether it is a score when `isNotation` is sent (docs/uploads-and-blob.md, "PDFs"); an editor of the account. */
export const updatePdf = command(
	SongPdfUpdateSchema,
	async ({ id, title, description, isNotation }) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfPdf, id);
		const row = await savePdf(accountId, id, { title, description, isNotation });
		if (!row) error(404, "PDF not found");
		return { title: row.title, description: row.description, isNotation: row.isNotation };
	},
);

/** The PDF and its thumbnail gone from the store and the song. */
export const deletePdf = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfPdf, id);
	if (!(await removePdf(accountId, id))) error(404, "PDF not found");
	return { deleted: true };
});
