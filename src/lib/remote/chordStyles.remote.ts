import { command, getRequestEvent, query } from "$app/server";
import {
	accountOfChordStyle,
	isEditor,
	memberOf,
	requireEditor,
	requireUser,
} from "$lib/server/access";
import {
	createChordStyle,
	deleteChordStyle as remove,
	listChordStyles as list,
	renameChordStyle as rename,
	updateChordStyle,
} from "$lib/server/data";
import {
	ChordStyleListSchema,
	ChordStyleRenameSchema,
	ChordStyleSaveSchema,
} from "$lib/val/ChordStyleSchema";
import { IdSchema } from "$lib/val/SongSchema";
import { error } from "@sveltejs/kit";

/** Custom chord styles (docs/chord-player.md, "Styles"): an account's library, seen by every member, kept by its editors, as the progressions. */

export const listChordStyles = query(ChordStyleListSchema, async ({ accountId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	await memberOf(locals, async () => accountId, accountId, { viewers: true });
	return list(accountId);
});

export const saveChordStyle = command(
	ChordStyleSaveSchema,
	async ({ accountId, id, name, data }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		requireEditor(locals, accountId);
		if (id) {
			const row = await updateChordStyle(accountId, id, { name, data });
			if (!row) error(404, "Style not found");
			return { id: row.id, name: row.name, updatedAt: row.updatedAt };
		}
		const row = await createChordStyle(accountId, user.id, name, data);
		return { id: row.id, name: row.name, updatedAt: row.updatedAt };
	},
);

async function editableStyle(id: string) {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const m = await memberOf(locals, accountOfChordStyle, id);
	if (!isEditor(m.role)) error(404, "Style not found");
	return m.accountId;
}

export const renameChordStyle = command(ChordStyleRenameSchema, async ({ id, name }) => {
	const accountId = await editableStyle(id);
	const row = await rename(accountId, id, name);
	if (!row) error(404, "Style not found");
	return { id: row.id, name: row.name };
});

export const deleteChordStyle = command(IdSchema, async ({ id }) => {
	const accountId = await editableStyle(id);
	await remove(accountId, id);
	return { id };
});
