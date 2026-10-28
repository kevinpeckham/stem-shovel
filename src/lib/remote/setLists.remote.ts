import { command, form, getRequestEvent } from "$app/server";
import {
	accountOfSetList,
	accountOfSetListItem,
	memberOf,
	requireEditor,
	requireUser,
} from "#lib/server/access.js";
import {
	addSetListItem as addItem,
	createSetList as create,
	deleteSetList as remove,
	deleteSetListItem as removeItem,
	duplicateSetList as duplicate,
	reorderSetListItems as reorderItems,
	updateSetList as update,
	updateSetListItem as updateItem,
} from "#lib/server/data.js";
import {
	SetListCreateSchema,
	SetListIdSchema,
	SetListItemAddSchema,
	SetListItemIdSchema,
	SetListItemUpdateSchema,
	SetListReorderSchema,
	SetListUpdateSchema,
} from "#lib/val/SetListSchema.js";
import { error, redirect } from "@sveltejs/kit";

/** A new set list (docs/band-plan.md, phase 1) in the account; an editor of it. Lands on its editor. */
export const createSetList = form(SetListCreateSchema, async ({ accountId, title, notes }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const m = requireEditor(locals, accountId);
	const row = await create(accountId, user.id, { title, notes });
	if (!row) error(409, "This account holds as many set lists as it may.");
	redirect(303, `/${m.slug}/set-lists/${row.id}`);
});

/** A set list's title and notes; an editor of its account. */
export const updateSetList = form(SetListUpdateSchema, async ({ id, title, notes }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSetList, id);
	if (!(await update(accountId, id, { title, notes }))) error(404, "Not found");
	return { ok: true };
});

/** The set list, its rows and its share links. */
export const deleteSetList = command(SetListIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSetList, id);
	if (!(await remove(accountId, id))) error(404, "Not found");
	return { deleted: true };
});

/** A copy of the set list, its rows with it, made by this user; 409 at the account's cap. */
export const duplicateSetList = command(SetListIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSetList, id);
	const row = await duplicate(accountId, id, user.id);
	if (!row) error(409, "This account holds as many set lists as it may.");
	return { id: row.id };
});

/** A row at the end: a song of the account or free text. */
export const addSetListItem = command(
	SetListItemAddSchema,
	async ({ setListId, songId, title, note }) => {
		const { locals } = getRequestEvent();
		requireUser(locals);
		const { accountId } = await memberOf(locals, accountOfSetList, setListId);
		const row = await addItem(accountId, setListId, { songId: songId || null, title, note });
		if (row === "full") error(409, "This set list is full");
		if (!row) error(404, "Not found");
		return row;
	},
);

/** A row's note, and a free-text row's title. */
export const updateSetListItem = command(SetListItemUpdateSchema, async ({ id, title, note }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSetListItem, id);
	const row = await updateItem(accountId, id, { title, note });
	if (!row) error(404, "Not found");
	return row;
});

export const deleteSetListItem = command(SetListItemIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSetListItem, id);
	if (!(await removeItem(accountId, id))) error(404, "Not found");
	return { deleted: true };
});

/** The rows in a new order: every row of the set list, once each (400 otherwise). */
export const reorderSetListItems = command(SetListReorderSchema, async ({ setListId, ids }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSetList, setListId);
	if (!(await reorderItems(accountId, setListId, ids)))
		error(400, "The order must name every row of the set list once.");
	return { ok: true };
});
