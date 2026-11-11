import { command, form, getRequestEvent } from "$app/server";
import { accountOfArrangement, accountOfSong, memberOf, requireUser } from "#lib/server/access.js";
import {
	createArrangement as create,
	deleteArrangement as remove,
	reorderArrangements as reorder,
	updateArrangement as update,
} from "#lib/server/data.js";
import {
	ArrangementCreateSchema,
	ArrangementOrderSchema,
	ArrangementUpdateSchema,
} from "#lib/val/ArrangementSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error, invalid } from "@sveltejs/kit";

/**
 * A song's alternate arrangements (docs/arrangements.md). Any editor of the
 * song (memberOf → requireEditor, a restricted project's rules included)
 * creates, renames, reorders and deletes them, as for the song's stems; the
 * account is never taken from the request.
 */

/** A new arrangement from the switcher's popover: a name, a note and where it starts from; answers its id so the page can open it. */
export const createArrangement = form(
	ArrangementCreateSchema,
	async ({ songId, name, note, from }, issue) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfSong, songId);
		const result = await create(accountId, requireUser(locals).id, songId, { name, note, from });
		if (!result) error(404, "Song not found");
		if (!result.ok) invalid(issue[result.field](result.error));
		return { id: result.id };
	},
);

/** A new name and/or note for an alternate (a field left out stays). */
export const updateArrangement = form(
	ArrangementUpdateSchema,
	async ({ id, name, note }, issue) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfArrangement, id);
		const result = await update(accountId, id, { name, note });
		if (!result) error(404, "Arrangement not found");
		if (!result.ok) invalid(issue[result.field === "from" ? "name" : result.field](result.error));
		return { id: result.id };
	},
);

/** Deletes an alternate and its stems (a file another arrangement shares stays); the page goes back to Main. */
export const deleteArrangement = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfArrangement, id);
	if (!(await remove(accountId, id))) error(404, "Arrangement not found");
});

/** The song's alternates in a new order, dragged in the switcher; the order is the song's, for everyone. */
export const reorderArrangements = command(ArrangementOrderSchema, async ({ songId, ids }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, songId);
	return { ids: await reorder(accountId, songId, ids) };
});
