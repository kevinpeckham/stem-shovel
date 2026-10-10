import { command, getRequestEvent, query } from "$app/server";
import {
	accountOfAmpPreset,
	isEditor,
	memberOf,
	requireEditor,
	requireUser,
} from "#lib/server/access.js";
import {
	countAmpPresets,
	createAmpPreset,
	deleteAmpPreset as remove,
	listAmpPresets as list,
	renameAmpPreset as rename,
	setAmpPresetSlot as place,
	updateAmpPreset,
} from "#lib/server/data.js";
import { MAX_AMP_PRESETS } from "#lib/constants/amp.js";
import {
	AmpPresetListSchema,
	AmpPresetRenameSchema,
	AmpPresetSaveSchema,
	AmpPresetSetSlotSchema,
} from "#lib/val/AmpPresetSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error } from "@sveltejs/kit";

/** Saved amp presets (docs/practice-amp.md, "Presets"): an account's library, seen by every member, kept by its editors; the piano's shape. */

/** The account's presets, both instruments, slotted ones first. */
export const listAmpPresets = query(AmpPresetListSchema, async ({ accountId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	await memberOf(locals, async () => accountId, accountId, { viewers: true });
	return list(accountId);
});

/** A new preset in the account, or the named one brought up to date; editors only; the account keeps at most MAX_AMP_PRESETS. */
export const saveAmpPreset = command(
	AmpPresetSaveSchema,
	async ({ accountId, id, name, instrument, slot, data }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		requireEditor(locals, accountId);
		if (id) {
			const row = await updateAmpPreset(accountId, id, { name, instrument, data, slot });
			if (!row) error(404, "Preset not found");
			return { id: row.id, name: row.name, slot: row.slot, updatedAt: row.updatedAt };
		}
		if ((await countAmpPresets(accountId)) >= MAX_AMP_PRESETS)
			error(400, `An account keeps up to ${MAX_AMP_PRESETS} amp presets; delete one first`);
		const row = await createAmpPreset(accountId, user.id, name, instrument, data, slot ?? null);
		return { id: row.id, name: row.name, slot: row.slot, updatedAt: row.updatedAt };
	},
);

async function editablePreset(id: string) {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const m = await memberOf(locals, accountOfAmpPreset, id);
	if (!isEditor(m.role)) error(404, "Preset not found");
	return m.accountId;
}

export const renameAmpPreset = command(AmpPresetRenameSchema, async ({ id, name }) => {
	const accountId = await editablePreset(id);
	const row = await rename(accountId, id, name);
	if (!row) error(404, "Preset not found");
	return { id: row.id, name: row.name };
});

/** Put a preset on one of its instrument's slot buttons (taking the slot from any other), or take it off (null). */
export const setAmpPresetSlot = command(AmpPresetSetSlotSchema, async ({ id, slot }) => {
	const accountId = await editablePreset(id);
	const row = await place(accountId, id, slot);
	if (!row) error(404, "Preset not found");
	return { id: row.id, slot: row.slot };
});

export const deleteAmpPreset = command(IdSchema, async ({ id }) => {
	const accountId = await editablePreset(id);
	await remove(accountId, id);
	return { id };
});
