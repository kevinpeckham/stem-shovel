import { command, getRequestEvent, query } from "$app/server";
import {
	accountOfPianoPreset,
	isEditor,
	memberOf,
	requireEditor,
	requireUser,
} from "$lib/server/access";
import {
	countPianoPresets,
	createPianoPreset,
	deletePianoPreset as remove,
	listPianoPresets as list,
	renamePianoPreset as rename,
	setPianoPresetSlot as place,
	updatePianoPreset,
} from "$lib/server/data";
import { MAX_PIANO_PRESETS } from "$lib/constants/piano";
import {
	PianoPresetListSchema,
	PianoPresetRenameSchema,
	PianoPresetSaveSchema,
	PianoPresetSetSlotSchema,
} from "$lib/val/PianoPresetSchema";
import { IdSchema } from "$lib/val/SongSchema";
import { error } from "@sveltejs/kit";

/** Saved piano presets (docs/piano.md, "Presets"): an account's library, seen by every member, kept by its editors. */

/** The account's presets, slotted ones first. */
export const listPianoPresets = query(PianoPresetListSchema, async ({ accountId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	await memberOf(locals, async () => accountId, accountId);
	return list(accountId);
});

/** A new preset in the account, or the named one brought up to date; editors only; the account keeps at most MAX_PIANO_PRESETS. */
export const savePianoPreset = command(
	PianoPresetSaveSchema,
	async ({ accountId, id, name, slot, instrument, data }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		requireEditor(locals, accountId);
		if (id) {
			const row = await updatePianoPreset(accountId, id, { name, data, slot, instrument });
			if (!row) error(404, "Preset not found");
			return {
				id: row.id,
				name: row.name,
				slot: row.slot,
				chordSlot: row.chordSlot,
				updatedAt: row.updatedAt,
			};
		}
		if ((await countPianoPresets(accountId)) >= MAX_PIANO_PRESETS)
			error(400, `An account keeps up to ${MAX_PIANO_PRESETS} presets; delete one first`);
		const row = await createPianoPreset(accountId, user.id, name, data, slot ?? null, instrument);
		return {
			id: row.id,
			name: row.name,
			slot: row.slot,
			chordSlot: row.chordSlot,
			updatedAt: row.updatedAt,
		};
	},
);

async function editablePreset(id: string) {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const m = await memberOf(locals, accountOfPianoPreset, id);
	if (!isEditor(m.role)) error(404, "Preset not found");
	return m.accountId;
}

export const renamePianoPreset = command(PianoPresetRenameSchema, async ({ id, name }) => {
	const accountId = await editablePreset(id);
	const row = await rename(accountId, id, name);
	if (!row) error(404, "Preset not found");
	return { id: row.id, name: row.name };
});

/** Put a preset on a slot button (taking the slot from any other), or take it off (null). */
export const setPianoPresetSlot = command(
	PianoPresetSetSlotSchema,
	async ({ id, slot, instrument }) => {
		const accountId = await editablePreset(id);
		const row = await place(accountId, id, slot, instrument);
		if (!row) error(404, "Preset not found");
		return { id: row.id, slot: row.slot, chordSlot: row.chordSlot };
	},
);

export const deletePianoPreset = command(IdSchema, async ({ id }) => {
	const accountId = await editablePreset(id);
	await remove(accountId, id);
	return { id };
});
