import { command, getRequestEvent } from "$app/server";
import { accountOfMix, isEditor, memberOf } from "#lib/server/access.js";
import { deleteMix, renameMix as rename, setMixNotes as setNotes } from "#lib/server/data.js";
import { MixNotesSchema, MixRenameSchema } from "#lib/val/MixSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error } from "@sveltejs/kit";

/**
 * A song's mixes (docs/mixes.md): uploaded through /api/mixes, kept by the
 * account's editors here. Commands, called from the mix's menu and the
 * notes editor; the page refreshes after each.
 */

/** Only an editor of the account touches a mix; anyone else is "not found". */
async function editorOfMix(mixId: string) {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfMix, mixId);
	if (!isEditor(m.role)) error(404, "Mix not found");
	return m.accountId;
}

export const renameMix = command(MixRenameSchema, async ({ id, label }) => {
	const accountId = await editorOfMix(id);
	const row = await rename(accountId, id, label);
	if (!row) error(404, "Mix not found");
	return row;
});

/** The engineer's notes, markdown; the page re-renders them on refresh. */
export const setMixNotes = command(MixNotesSchema, async ({ id, notes }) => {
	const accountId = await editorOfMix(id);
	const row = await setNotes(accountId, id, notes);
	if (!row) error(404, "Mix not found");
	return row;
});

/** The mix, its comments and its files go. */
export const removeMix = command(IdSchema, async ({ id }) => {
	const accountId = await editorOfMix(id);
	if (!(await deleteMix(accountId, id))) error(404, "Mix not found");
	return { deleted: true };
});
