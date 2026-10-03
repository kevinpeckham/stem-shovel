import { command, getRequestEvent, query } from "$app/server";
import {
	accountOfProgression,
	isEditor,
	memberOf,
	requireEditor,
	requireUser,
} from "$lib/server/access";
import {
	createProgression,
	deleteProgression as remove,
	listProgressions as list,
	renameProgression as rename,
	updateProgression,
} from "$lib/server/data";
import {
	ProgressionListSchema,
	ProgressionRenameSchema,
	ProgressionSaveSchema,
} from "$lib/val/ProgressionSchema";
import { IdSchema } from "$lib/val/SongSchema";
import { error } from "@sveltejs/kit";

/** Saved progressions from the chord player's pad (docs/chord-player.md, "The progression pad"): an account's library, seen by every member, kept by its editors. */

/** The account's progressions, newest first. */
export const listProgressions = query(ProgressionListSchema, async ({ accountId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	await memberOf(locals, async () => accountId, accountId);
	return list(accountId);
});

/** A new progression in the account, or the named one brought up to date; editors only. */
export const saveProgression = command(
	ProgressionSaveSchema,
	async ({ accountId, id, name, data }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		requireEditor(locals, accountId);
		if (id) {
			const row = await updateProgression(accountId, id, { name, data });
			if (!row) error(404, "Progression not found");
			return { id: row.id, name: row.name, updatedAt: row.updatedAt };
		}
		const row = await createProgression(accountId, user.id, name, data);
		return { id: row.id, name: row.name, updatedAt: row.updatedAt };
	},
);

async function editableProgression(id: string) {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const m = await memberOf(locals, accountOfProgression, id);
	if (!isEditor(m.role)) error(404, "Progression not found");
	return m.accountId;
}

export const renameProgression = command(ProgressionRenameSchema, async ({ id, name }) => {
	const accountId = await editableProgression(id);
	const row = await rename(accountId, id, name);
	if (!row) error(404, "Progression not found");
	return { id: row.id, name: row.name };
});

export const deleteProgression = command(IdSchema, async ({ id }) => {
	const accountId = await editableProgression(id);
	await remove(accountId, id);
	return { id };
});
