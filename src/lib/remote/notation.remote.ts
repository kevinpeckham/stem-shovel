import { command, getRequestEvent } from "$app/server";
import { accountOfNotation, memberOf } from "$lib/server/access";
import { deleteNotation as removeNotation, updateNotation as saveNotation } from "$lib/server/data";
import { NotationDeleteSchema, NotationUpdateSchema } from "$lib/val/SongNotationSchema";
import { error } from "@sveltejs/kit";

/** A notation file's title and description (docs/uploads-and-blob.md, "Notation files"); an editor of the account. */
export const updateNotation = command(NotationUpdateSchema, async ({ id, title, description }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfNotation, id);
	const row = await saveNotation(accountId, id, { title, description });
	if (!row) error(404, "Notation file not found");
	return { title: row.title, description: row.description };
});

/** The notation file and its thumbnail gone from the store and the song. */
export const deleteNotation = command(NotationDeleteSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfNotation, id);
	if (!(await removeNotation(accountId, id))) error(404, "Notation file not found");
	return { deleted: true };
});
