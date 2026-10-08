import { command, getRequestEvent, query } from "$app/server";
import { accountOfBeat, memberOf, requireEditor, requireUser } from "#lib/server/access.js";
import {
	createBeat,
	deleteBeat as remove,
	listBeats as list,
	renameBeat as rename,
	songForBeat,
	updateBeat,
} from "#lib/server/data.js";
import { BeatListSchema, BeatRenameSchema, BeatSaveSchema } from "#lib/val/BeatSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { isEditor } from "#lib/server/access.js";
import { error } from "@sveltejs/kit";

/** Saved beats from the drum machine (docs/drum-machine.md, Phase 3): an account's library, seen by every member, kept by its editors. */

/** The account's beats, newest first, with their projects (a few hundred bytes each). */
export const listBeats = query(BeatListSchema, async ({ accountId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	await memberOf(locals, async () => accountId, accountId, { viewers: true });
	return list(accountId);
});

/** A new beat in the account, or the named one brought up to date; editors only. */
export const saveBeat = command(BeatSaveSchema, async ({ accountId, id, name, data, songId }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	requireEditor(locals, accountId);
	if (id) {
		const row = await updateBeat(accountId, id, { name, data });
		if (!row) error(404, "Beat not found");
		return { id: row.id, name: row.name, updatedAt: row.updatedAt };
	}
	// A song must be the account's own; anything else saves the beat without one.
	const song = songId ? await songForBeat(accountId, songId) : null;
	const row = await createBeat(accountId, user.id, name, data, song?.id ?? null);
	return { id: row.id, name: row.name, updatedAt: row.updatedAt };
});

async function editableBeat(id: string) {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const m = await memberOf(locals, accountOfBeat, id);
	if (!isEditor(m.role)) error(404, "Beat not found");
	return m.accountId;
}

export const renameBeat = command(BeatRenameSchema, async ({ id, name }) => {
	const accountId = await editableBeat(id);
	const row = await rename(accountId, id, name);
	if (!row) error(404, "Beat not found");
	return { id: row.id, name: row.name };
});

export const deleteBeat = command(IdSchema, async ({ id }) => {
	const accountId = await editableBeat(id);
	await remove(accountId, id);
	return { id };
});
